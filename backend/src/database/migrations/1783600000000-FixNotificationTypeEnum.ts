import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The `NotificationType` TS enum (src/common/enums/index.ts) has 21 values,
 * but the Postgres enum `notifications_type_enum` was only ever created with
 * the original 15 values from InitialSchema and was never migrated forward.
 *
 * Missing values (cause 500 QueryFailedError: invalid input value for enum):
 *   - task_completed
 *   - task_status_changed
 *   - project_member_invite
 *   - project_member_accepted
 *   - project_member_declined
 *   - meeting_invite
 *
 * `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block together
 * with other statements in some PG versions when the new value is used
 * later in the same transaction, but it CAN run standalone. TypeORM wraps
 * migrations in a transaction by default, so we guard each ADD VALUE with
 * `IF NOT EXISTS` (PG 12+) and keep them as independent statements — this
 * is safe to re-run and safe inside TypeORM's transaction wrapper as long
 * as we don't use the new value in the same migration.
 */
export class FixNotificationTypeEnum1783600000000 implements MigrationInterface {
  name = 'FixNotificationTypeEnum1783600000000';

  private readonly missingValues = [
    'task_completed',
    'task_status_changed',
    'project_member_invite',
    'project_member_accepted',
    'project_member_declined',
    'meeting_invite',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of this.missingValues) {
      await queryRunner.query(
        `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Postgres does not support removing a value from an enum type directly.
    // A down-migration would require: create a new enum without the values,
    // update the column to use it, drop the old type, rename the new one —
    // and would fail if any row already uses the values being removed.
    // Intentionally a no-op; this migration is additive-only and safe to leave.
  }
}
