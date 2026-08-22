import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '../../../database/database.service';
import { StorageService } from '../../storage/storage.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { MeetingParticipantRole } from '../../../common/enums/meeting.enum';
import { RECORDING_COLUMNS_SQL } from '../meetings.sql';
import { MeetingsRepository } from '../repositories/meetings.repository';
import {
  MEETING_RECORDING_QUEUE,
  MAX_RECORDING_DURATION_SECONDS,
} from '../meetings.constants';

@Injectable()
export class MeetingRecordingService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly meetingsRepository: MeetingsRepository,
    @InjectQueue(MEETING_RECORDING_QUEUE)
    private readonly recordingQueue: Queue,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Only the host or a co-host can start a recording. Enforced here (not
   * just in the UI) because the WebSocket handler is a thin wrapper around
   * this method — this is the actual authorization boundary.
   */
  async assertCanRecord(meetingId: string, userId: string) {
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
    const role = participantRows[0]?.role;
    if (role !== MeetingParticipantRole.CO_HOST) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_HOST_ONLY,
        message: 'Only the host or a co-host can control recording',
      });
    }
    return meeting;
  }

  async startRecording(meetingId: string, userId: string) {
    await this.assertCanRecord(meetingId, userId);

    const activeRows = await this.dataSource.query(
      `SELECT id FROM meeting_recordings WHERE meeting_id = $1 AND status = 'recording'`,
      [meetingId],
    );
    if (activeRows[0]) {
      throw new ConflictException({
        code: ErrorCode.MEETING_RECORDING_ALREADY_ACTIVE,
        message: 'A recording is already in progress for this meeting',
      });
    }

    const rows = await this.dataSource.query(
      `INSERT INTO meeting_recordings (meeting_id, started_by, status, started_at)
       VALUES ($1, $2, 'recording', now())
       RETURNING ${RECORDING_COLUMNS_SQL}`,
      [meetingId, userId],
    );
    const recording = rows[0];

    // Hard server-side cutoff: fires even if the client crashes, loses
    // connection, or simply never sends a stop — this is the real cap,
    // not just a UI countdown.
    await this.recordingQueue.add(
      'auto-stop',
      { recordingId: recording.id, meetingId },
      {
        delay: MAX_RECORDING_DURATION_SECONDS * 1000,
        jobId: `auto-stop_${recording.id}`,
      },
    );

    return recording;
  }

  /**
   * Called either by the host (manual stop) or by the auto-stop BullMQ job
   * (`autoStopped: true`) once MAX_RECORDING_DURATION_SECONDS elapses.
   */
  async stopRecording(
    meetingId: string,
    userId: string | null,
    opts: {
      autoStopped?: boolean;
      storageKey?: string;
      storageUrl?: string;
      fileSize?: number;
    } = {},
  ) {
    if (userId) await this.assertCanRecord(meetingId, userId);

    const rows = await this.dataSource.query(
      `SELECT ${RECORDING_COLUMNS_SQL} FROM meeting_recordings WHERE meeting_id = $1 AND status = 'recording'`,
      [meetingId],
    );
    const recording = rows[0];
    if (!recording) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_RECORDING_NOT_ACTIVE,
        message: 'No active recording for this meeting',
      });
    }

    const durationSeconds = Math.min(
      MAX_RECORDING_DURATION_SECONDS,
      Math.floor((Date.now() - new Date(recording.startedAt).getTime()) / 1000),
    );

    const updatedRows = await this.dataSource.query(
      `UPDATE meeting_recordings
         SET status = 'completed', stopped_at = now(), duration_seconds = $2,
             auto_stopped = $3, storage_key = COALESCE($4, storage_key),
             storage_url = COALESCE($5, storage_url), file_size = COALESCE($6, file_size)
         WHERE id = $1
         RETURNING ${RECORDING_COLUMNS_SQL}`,
      [
        recording.id,
        durationSeconds,
        opts.autoStopped ?? false,
        opts.storageKey ?? null,
        opts.storageUrl ?? null,
        opts.fileSize ?? null,
      ],
    );

    // If this was a manual stop, cancel the pending auto-stop job so it
    // doesn't fire a redundant stop later.
    if (!opts.autoStopped) {
      const job = await this.recordingQueue.getJob(`auto-stop_${recording.id}`);
      await job?.remove().catch(() => undefined);
    }

    return updatedRows[0];
  }

  /**
   * Taking part in the meeting is what grants access to its recordings —
   * not membership of some group.
   *
   * This used to call `assertMember(meeting.groupId, …)`, which is wrong
   * in both directions. A standalone meeting (POST /meetings, no group)
   * has `groupId = null`, so the lookup matched nothing and *everyone*
   * was refused, the host who made the recording included. And for a
   * group meeting it asked the wrong question: any colleague who never
   * joined the call could list its recordings.
   *
   * `left_at` is deliberately not checked — recordings are watched after the
   * call, and hanging up is not meant to revoke access to it.
   */
  private async assertWasInMeeting(meetingId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM meetings m
        WHERE m.id = $1
          AND (m.host_id = $2
               OR EXISTS (SELECT 1 FROM meeting_participants mp
                           WHERE mp.meeting_id = m.id AND mp.user_id = $2))`,
      [meetingId, userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_NOT_PARTICIPANT,
        message: 'Only people who took part in this meeting can see it',
      });
    }
  }

  async listRecordings(meetingId: string, userId: string) {
    const meeting = await this.meetingsRepository.findMeeting(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });
    await this.assertWasInMeeting(meetingId, userId);

    return this.dataSource.query(
      `SELECT ${RECORDING_COLUMNS_SQL} FROM meeting_recordings WHERE meeting_id = $1 ORDER BY started_at DESC`,
      [meetingId],
    );
  }

  /** Presigned PUT URL for the client to upload the recorded blob directly to R2 once stopped. */
  async presignRecordingUpload(
    meetingId: string,
    recordingId: string,
    userId: string,
    mimeType: string,
    fileSize: number,
  ) {
    await this.assertCanRecord(meetingId, userId);

    const rows = await this.dataSource.query(
      `SELECT id FROM meeting_recordings WHERE id = $1 AND meeting_id = $2`,
      [recordingId, meetingId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_RECORDING_NOT_FOUND,
        message: 'Recording not found',
      });
    }

    const ext = mimeType === 'video/mp4' ? 'mp4' : 'webm';
    const { uploadUrl, storageKey, storageUrl } =
      await this.storageService.getPresignedUploadUrl(
        'meeting-recordings',
        meetingId,
        `${recordingId}.${ext}`,
        mimeType,
        fileSize,
      );
    return { uploadUrl, storageKey, storageUrl };
  }
}
