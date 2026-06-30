import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * System design v2 §5 — PUSH TYPE QOIDASI:
 * "agar repository ulanmagan: → draft (majburiy)"
 * Draft pushes have no repository yet, so repository_id must be nullable.
 */
export class TaskPushRepositoryNullable1783300000000 implements MigrationInterface {
  name = 'TaskPushRepositoryNullable1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "task_pushes" ALTER COLUMN "repository_id" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Backfill is impossible to know for pre-existing drafts; refuse to set NOT NULL
    // if NULLs already exist — operator must resolve manually before downgrading.
    await queryRunner.query(
      `ALTER TABLE "task_pushes" ALTER COLUMN "repository_id" SET NOT NULL`,
    );
  }
}
