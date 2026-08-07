import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { MembersService } from '../../workspaces/services/members.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { RedisService } from '../../../redis/redis.service';
import { RedisKeys } from '../../../redis/redis.keys';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { NotificationType, RoomScope } from '../../../common/enums';
import {
  MeetingJoinRequestStatus,
  MeetingParticipantRole,
  MeetingStatus,
} from '../../../common/enums/meeting.enum';
import { normalizeReturning } from '../../../common/utils/sql.util';
import { JOIN_REQUEST_COLUMNS_SQL } from '../meetings.sql';
import { MeetingsRepository } from '../repositories/meetings.repository';
import { MeetingAccessService } from './meeting-access.service';
import { MeetingsService } from '../meetings.service';

@Injectable()
export class MeetingJoinRequestService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly meetingsRepository: MeetingsRepository,
    private readonly accessService: MeetingAccessService,
    // WorkspacesModule <-> MeetingsModule is a forwardRef'd module import
    // (see meetings.module.ts) — mirror that on the injected service too.
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService,
    // MeetingsService -> MeetingJoinRequestService -> NotificationsService
    // -> EventsGateway -> MeetingsService closes a cycle; forwardRef
    // required here to avoid undefined at runtime.
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
    // MeetingJoinRequestService.requestToJoin() -> MeetingsService.join()
    // while MeetingsService.getOne() -> this.getWaitingCount() closes a
    // cycle — forwardRef required on both sides.
    @Inject(forwardRef(() => MeetingsService))
    private readonly meetingsService: MeetingsService,
  ) {}

  // ── Waiting Room Redis fast path ──────────────────────────────────────────
  // meeting_join_requests (Postgres) stays the source of truth; this sorted
  // set exists purely so "how many/who is waiting right now" is an O(log n)
  // Redis read instead of a Postgres round trip on every socket event /
  // badge render. Best-effort: a Redis outage falls back to Postgres-only
  // (see listJoinRequests), it never blocks the actual approve/reject flow.

  private async markWaiting(meetingId: string, userId: string) {
    try {
      await this.redisService
        .getClient()
        ?.zadd(RedisKeys.meetingWaiting(meetingId), Date.now(), userId);
    } catch {
      // fail open — Postgres is still authoritative
    }
  }

  private async unmarkWaiting(meetingId: string, userIds: string[]) {
    if (!userIds.length) return;
    try {
      await this.redisService
        .getClient()
        ?.zrem(RedisKeys.meetingWaiting(meetingId), ...userIds);
    } catch {
      // fail open
    }
  }

  /** Fast count for badges; falls back to null (caller should treat as "unknown") if Redis is down. */
  async getWaitingCount(meetingId: string): Promise<number | null> {
    try {
      const count = await this.redisService
        .getClient()
        ?.zcard(RedisKeys.meetingWaiting(meetingId));
      return count ?? null;
    } catch {
      return null;
    }
  }

  private async assertCanManageJoinRequests(meetingId: string, userId: string) {
    const meeting = await this.meetingsRepository.findMeeting(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });
    if (meeting.hostId === userId) return meeting;

    const participantRows = await this.dataSource.query(
      `SELECT role FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meetingId, userId],
    );
    if (participantRows[0]?.role !== MeetingParticipantRole.CO_HOST) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_HOST_ONLY,
        message: 'Only the host or a co-host can manage join requests',
      });
    }
    return meeting;
  }

  /**
   * Called by a guest who is not eligible for instant join. If they're
   * actually eligible (visibility allows it, or they were pre-approved via
   * an earlier invite), this just joins them directly instead of making
   * them wait on a request that would be auto-approved anyway.
   */
  async requestToJoin(meetingId: string, userId: string) {
    const meeting = await this.meetingsRepository.findMeeting(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });
    if (
      meeting.status === MeetingStatus.ENDED ||
      meeting.status === MeetingStatus.CANCELLED
    ) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_ENDED,
        message: 'Meeting is no longer active',
      });
    }

    // `left_at IS NULL`, matching join(): someone who left is not "already
    // joined", and short-circuiting here for them skipped the whole
    // approval/lock flow on the way back in.
    const existingRows = await this.dataSource.query(
      `SELECT id FROM meeting_participants
        WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meetingId, userId],
    );
    if (existingRows[0]) {
      return {
        status: 'already_joined' as const,
        meeting: await this.meetingsService.getOne(meetingId, userId),
      };
    }

    const decision = await this.accessService.resolveAccess(meeting, userId);
    if (decision.kind === 'denied') {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_ACCESS_DENIED,
        message: this.accessService.accessDeniedMessage(decision.reason),
      });
    }
    if (
      decision.kind === 'host' ||
      decision.kind === 'participant' ||
      decision.kind === 'auto'
    ) {
      return {
        status: 'joined' as const,
        meeting: await this.meetingsService.join(meetingId, userId),
      };
    }

    // decision.kind === 'approval'
    if (decision.joinRequest?.status === MeetingJoinRequestStatus.PENDING) {
      return { status: 'pending' as const, requestId: decision.joinRequest.id };
    }

    // A rejection that can be re-sent instantly isn't a rejection — it's a
    // button the host has to keep pressing. The waiting room notifies every
    // host and co-host on each request, so an unthrottled re-request is a way
    // to spam people mid-call. Short enough not to punish someone who was
    // rejected by a misclick.
    if (decision.joinRequest?.status === MeetingJoinRequestStatus.REJECTED) {
      const retryAfterSeconds = this.accessService.rejectionCooldownRemaining(
        decision.joinRequest.reviewedAt,
      );
      if (retryAfterSeconds > 0) {
        throw new ForbiddenException({
          code: ErrorCode.MEETING_ACCESS_DENIED,
          message: `Your request was declined — you can ask again in ${retryAfterSeconds}s.`,
          retryAfterSeconds,
        });
      }
    }

    const rows = normalizeReturning(
      await this.dataSource.query(
        `INSERT INTO meeting_join_requests (meeting_id, user_id, status, requested_at)
         VALUES ($1, $2, 'pending', now())
         ON CONFLICT (meeting_id, user_id)
         DO UPDATE SET status = 'pending', requested_at = now(), reviewed_by = NULL, reviewed_at = NULL
         RETURNING ${JOIN_REQUEST_COLUMNS_SQL}`,
        [meetingId, userId],
      ),
    );
    await this.markWaiting(meetingId, userId);
    return { status: 'pending' as const, requestId: rows[0].id };
  }

  /** Requester cancels their own pending request (e.g. gave up waiting). */
  async cancelMyJoinRequest(meetingId: string, userId: string) {
    const rows = normalizeReturning(
      await this.dataSource.query(
        `UPDATE meeting_join_requests
         SET status = 'cancelled', reviewed_at = now()
         WHERE meeting_id = $1 AND user_id = $2 AND status = 'pending'
         RETURNING ${JOIN_REQUEST_COLUMNS_SQL}`,
        [meetingId, userId],
      ),
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_JOIN_REQUEST_NOT_FOUND,
        message: 'No pending join request to cancel',
      });
    }
    await this.unmarkWaiting(meetingId, [userId]);
    return rows[0];
  }

  /** Host/co-host: pending requests for the waiting-room sidebar. */
  async listJoinRequests(meetingId: string, userId: string) {
    await this.assertCanManageJoinRequests(meetingId, userId);
    return this.dataSource.query(
      `SELECT r.id, r.meeting_id AS "meetingId", r.user_id AS "userId", r.status,
              r.requested_at AS "requestedAt",
              u.first_name AS "firstName", u.last_name AS "lastName", u.avatar_url AS "avatarUrl"
       FROM meeting_join_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.meeting_id = $1 AND r.status = 'pending'
       ORDER BY r.requested_at ASC`,
      [meetingId],
    );
  }

  /** Host/co-host: accept or reject a single waiting-room request (✓ / ✕). */
  async reviewJoinRequest(
    meetingId: string,
    requestId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
  ) {
    await this.assertCanManageJoinRequests(meetingId, reviewerId);

    const rows = normalizeReturning(
      await this.dataSource.query(
        `UPDATE meeting_join_requests
         SET status = $3::meeting_join_request_status_enum, reviewed_by = $4, reviewed_at = now()
         WHERE id = $1 AND meeting_id = $2 AND status = 'pending'
         RETURNING ${JOIN_REQUEST_COLUMNS_SQL}`,
        [requestId, meetingId, decision, reviewerId],
      ),
    );
    const updated = rows[0];
    if (!updated) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_JOIN_REQUEST_NOT_FOUND,
        message: 'Join request not found or already reviewed',
      });
    }
    await this.unmarkWaiting(meetingId, [updated.userId]);
    return updated;
  }

  /** Host/co-host: "Accept All" / "Reject All" batch action. */
  async batchReviewJoinRequests(
    meetingId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
  ) {
    await this.assertCanManageJoinRequests(meetingId, reviewerId);
    const updated = normalizeReturning(
      await this.dataSource.query(
        `UPDATE meeting_join_requests
         SET status = $2::meeting_join_request_status_enum, reviewed_by = $3, reviewed_at = now()
         WHERE meeting_id = $1 AND status = 'pending'
         RETURNING ${JOIN_REQUEST_COLUMNS_SQL}`,
        [meetingId, decision, reviewerId],
      ),
    );
    await this.unmarkWaiting(
      meetingId,
      updated.map((row: any) => row.userId),
    );
    return updated;
  }

  /**
   * Invites people to a meeting by workspace member id and/or email address.
   * An email invite resolves to an existing registered account — this does
   * not send an email to non-users; it just gives a second lookup path for
   * "I know their email, not their workspace member id", which matters most
   * for PRIVATE/INVITE_ONLY meetings where the target may not be a member
   * of any shared workspace yet.
   */
  async inviteMembers(
    meetingId: string,
    inviterId: string,
    targetUserIds: string[],
    targetEmails: string[] = [],
  ) {
    const meeting = await this.meetingsRepository.findMeeting(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });

    // Workspace meetings: any workspace member can invite. Standalone
    // (workspace-less) meetings have no membership list to check against —
    // only the host may invite there.
    if (meeting.workspaceId) {
      await this.membersService.assertMember(meeting.workspaceId, inviterId);
    } else if (meeting.hostId !== inviterId) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_HOST_ONLY,
        message: 'Only the host can invite people to this meeting',
      });
    }

    const normalizedEmails = Array.from(
      new Set(
        targetEmails.map((email) => email.trim().toLowerCase()).filter(Boolean),
      ),
    );
    const emailRows: Array<{ id: string; email: string }> =
      normalizedEmails.length
        ? await this.dataSource.query(
            `SELECT id, email FROM users WHERE lower(email) = ANY($1::text[])`,
            [normalizedEmails],
          )
        : [];
    const foundEmails = new Set(
      emailRows.map((row) => row.email.toLowerCase()),
    );
    const notFoundEmails = normalizedEmails.filter(
      (email) => !foundEmails.has(email),
    );

    // Server-side guard: never let the inviter invite themself, and
    // de-duplicate. The frontend also filters the host out of the invite
    // list, but that filter must not be the only line of defense — a
    // stale UI, another client, or a direct API call could still send
    // the inviter's own id.
    const targetIds = Array.from(
      new Set([...targetUserIds, ...emailRows.map((row) => row.id)]),
    ).filter((uid) => uid !== inviterId);

    let validUserIds: string[];
    if (meeting.workspaceId && meeting.scope === RoomScope.WORKSPACE_ONLY) {
      // WORKSPACE_ONLY is the one scope where membership IS the access
      // control — inviting a non-member here would be a promise the meeting
      // can't keep (they'd hit the workspace-membership wall in resolveAccess
      // anyway), so filter to actual members.
      //
      // One query rather than one assertMember() per invitee: this is a bulk
      // filter, not an authorization decision about the caller, so it has no
      // use for the per-user cache and every reason to avoid N round trips.
      const memberRows = targetIds.length
        ? await this.dataSource.query<{ userId: string }>(
            `SELECT user_id AS "userId" FROM workspace_members
              WHERE workspace_id = $1 AND user_id = ANY($2::uuid[])`,
            [meeting.workspaceId as string, targetIds],
          )
        : [];
      validUserIds = memberRows.map((row) => row.userId);
    } else {
      // PRIVATE/INVITE_ONLY/PUBLIC: the invite itself IS the access grant —
      // workspace membership is irrelevant here by design (that's the whole
      // point of these scopes), so any resolved user id (explicit id or a
      // matched email, workspace member or not) is invitable.
      validUserIds = targetIds;
    }

    // Explicit host invite = pre-approved: PRIVATE/INVITE_ONLY meetings only
    // let invited users join directly, no waiting room. Approving here (rather
    // than inserting a participant row) keeps join() as the single place that
    // actually admits someone (capacity checks, auto-start, etc.).
    await Promise.all(
      validUserIds.map((uid) =>
        this.dataSource.query(
          `INSERT INTO meeting_join_requests (meeting_id, user_id, status, requested_at, reviewed_by, reviewed_at)
           VALUES ($1, $2, 'approved', now(), $3, now())
           ON CONFLICT (meeting_id, user_id) DO UPDATE
             SET status = 'approved', reviewed_by = $3, reviewed_at = now()
             WHERE meeting_join_requests.status <> 'approved'`,
          [meetingId, uid, inviterId],
        ),
      ),
    );
    await this.unmarkWaiting(meetingId, validUserIds);

    const notifications = validUserIds.map((uid) =>
      this.notificationsService.create({
        userId: uid,
        actorId: inviterId,
        type: NotificationType.MEETING_INVITE,
        title: 'Meeting Invitation',
        message: `Sizni "${meeting.title || 'Uchrashuv'}" nomli meetingga taklif qilishdi.`,
        entityType: 'meeting',
        entityId: meeting.id,
        actionUrl: `/app/meetings`,
        metadata: { joinCode: meeting.meetingCode },
      }),
    );

    await Promise.all(notifications);
    return { success: true, invitedCount: validUserIds.length, notFoundEmails };
  }
}
