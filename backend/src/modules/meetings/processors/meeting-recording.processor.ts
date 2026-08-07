import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { MeetingsService, MEETING_RECORDING_QUEUE } from '../meetings.service';
import { EventsGateway } from '../../gateway/events.gateway';

interface AutoStopJobData {
  recordingId: string;
  meetingId: string;
}

/**
 * Enforces the hard 1-hour recording cap server-side. Scheduled as a delayed
 * job the moment a recording starts (see MeetingsService.startRecording);
 * fires regardless of whether the client is still connected, so a dropped
 * connection or crashed tab can't leave a recording running indefinitely.
 * If the recording was already stopped manually, the corresponding delayed
 * job is removed and this never runs for it.
 */
@Injectable()
@Processor(MEETING_RECORDING_QUEUE)
export class MeetingRecordingProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingRecordingProcessor.name);

  constructor(
    @Inject(forwardRef(() => MeetingsService))
    private readonly meetingsService: MeetingsService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly gateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<AutoStopJobData, any, string>): Promise<void> {
    if (job.name !== 'auto-stop') return;
    const { meetingId, recordingId } = job.data;

    try {
      const recording = await this.meetingsService.stopRecording(
        meetingId,
        null,
        { autoStopped: true },
      );
      this.logger.log(
        `Auto-stopped recording ${recordingId} for meeting ${meetingId} (1h cap reached)`,
      );
      this.gateway.broadcastToMeeting(
        meetingId,
        'meeting:recording:auto-stopped',
        { recording },
      );
    } catch (err) {
      // Recording was likely already stopped manually in the tiny race window
      // before this job's removal took effect — not an error worth retrying.
      this.logger.debug(
        `Auto-stop skipped for ${recordingId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
