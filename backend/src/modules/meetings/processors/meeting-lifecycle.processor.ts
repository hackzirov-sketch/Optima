import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { MeetingsService, MEETING_LIFECYCLE_QUEUE } from '../meetings.service';
import { EventsGateway } from '../../gateway/events.gateway';

interface AutoEndJobData {
  meetingId: string;
  /** Set only on 'check-leave-grace' jobs. */
  userId?: string;
}

/**
 * Fires MEETING_AUTO_END_GRACE_SECONDS after the last active participant
 * leaves a LIVE meeting (see MeetingsService.scheduleAutoEndCheck). Re-checks
 * presence at fire time rather than trusting the state at schedule time, so
 * a reconnect/rejoin within the grace window cancels the auto-end — this is
 * what makes a meeting behave like Google Meet's "room closes when empty"
 * instead of ending the instant a flaky connection drops.
 */
@Injectable()
@Processor(MEETING_LIFECYCLE_QUEUE)
export class MeetingLifecycleProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingLifecycleProcessor.name);

  constructor(
    @Inject(forwardRef(() => MeetingsService))
    private readonly meetingsService: MeetingsService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly gateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<AutoEndJobData, any, string>): Promise<void> {
    // A dropped socket's "did they reconnect?" check. Queued rather than kept
    // as an in-process timer so it survives the deploy or crash that used to
    // lose it (see EventsGateway.handleDisconnect).
    if (job.name === 'check-leave-grace') {
      const { meetingId, userId } = job.data;
      if (!userId) return;
      await this.gateway.finalizeMeetingLeaveAfterGrace(meetingId, userId);
      return;
    }

    if (job.name !== 'check-auto-end') return;
    const { meetingId } = job.data;

    try {
      const meeting = await this.meetingsService.checkAutoEnd(meetingId);
      if (meeting) {
        this.logger.log(`Auto-ended empty meeting ${meetingId}`);
        this.gateway.broadcastToMeeting(meetingId, 'meeting:ended', {
          meetingId,
          reason: 'empty',
        });
      }
    } catch (err) {
      this.logger.debug(
        `Auto-end check skipped for ${meetingId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
