import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EducationSyncService } from './education-sync.service';

interface SyncPlaylistJob {
  playlistId: string;
  requestedBy: string;
}

/**
 * Runs catalogue syncs off the request path — see
 * EducationSyncService.syncPlaylist for why they can't happen inline.
 */
@Processor('education')
export class EducationSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(EducationSyncProcessor.name);

  constructor(private readonly sync: EducationSyncService) {
    super();
  }

  async process(job: Job<SyncPlaylistJob>): Promise<unknown> {
    if (job.name !== 'sync-playlist') return null;

    const { playlistId } = job.data;
    const result = await this.sync.runPlaylistSync(playlistId);
    this.logger.log(
      `Synced playlist ${playlistId}: found=${result.found} synced=${result.synced}`,
    );
    return result;
  }
}
