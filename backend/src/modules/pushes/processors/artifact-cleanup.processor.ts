import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

import { PushStatus } from '../../../common/enums';
import { StorageService } from '../../storage/storage.service';

export const ARTIFACT_CLEANUP_QUEUE = 'artifact-cleanup';
const REPEAT_JOB_NAME = 'sweep-expired-artifacts';
const BATCH_SIZE = 200;

/**
 * Design doc (section 10 / 18) calls for a recurring "artifact-cleanup" __job
 * that expires stale push artifacts stored in R2. This was never wired up —
 * `task_pushes.expires_at` existed but nothing ever read it, so expired
 * artifacts (and their R2 storage cost) accumulated forever.
 *
 * Per section 10: "Expired artifact: yuklab bo'lmaydi, analytics uchun
 * metadata qoladi" — we delete the R2 object but keep the DB row (status
 * flips to EXPIRED, storage pointers cleared) so analytics/history stay intact.
 */
@Injectable()
@Processor(ARTIFACT_CLEANUP_QUEUE)
export class ArtifactCleanupProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ArtifactCleanupProcessor.name);

  constructor(
    @InjectQueue(ARTIFACT_CLEANUP_QUEUE)
    private readonly queue: Queue,
    private readonly dataSource: DatabaseService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async onModuleInit() {
    // Idempotent: BullMQ dedups repeatable jobs by name+pattern, so this is
    // safe to run on every boot/redeploy without creating duplicate schedules.
    await this.queue.upsertJobScheduler(
      REPEAT_JOB_NAME,
      { pattern: '0 3 * * *' }, // daily at 03:00 server time
      { name: REPEAT_JOB_NAME, data: {} },
    );
  }

  async process(_job: Job): Promise<{ expired: number }> {
    let expired = 0;

    // Batch to avoid loading unbounded rows into memory on the first run
    // against a backlog that's been accumulating since launch.
    for (;;) {
      const batch: Array<{ id: string; storageKey: string | null }> =
        await this.dataSource.query(
          `SELECT id, storage_key AS "storageKey" FROM task_pushes
         WHERE status = $1::task_pushes_status_enum AND expires_at < now()
         LIMIT $2`,
          [PushStatus.UPLOADED, BATCH_SIZE],
        );
      if (batch.length === 0) break;

      for (const push of batch) {
        if (push.storageKey) {
          await this.storage.deleteFile(push.storageKey);
        }
      }

      const ids = batch.map((p) => p.id);
      await this.dataSource.query(
        `UPDATE task_pushes SET status = $1::task_pushes_status_enum, storage_url = NULL, storage_key = NULL
         WHERE id = ANY($2::uuid[])`,
        [PushStatus.EXPIRED, ids],
      );
      expired += batch.length;

      if (batch.length < BATCH_SIZE) break;
    }

    if (expired > 0) {
      this.logger.log(`Expired ${expired} push artifact(s)`);
    }
    return { expired };
  }
}
