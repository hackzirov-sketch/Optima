import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * System design v2 §3 — SOFT DELETE (yakuniy):
 * Faqat `deleted_at` (+ `deleted_by`) qoladi. `is_deleted` boolean butunlay
 * olib tashlanadi — barcha "active" tekshiruvlar endi `deleted_at IS NULL`
 * orqali amalga oshiriladi.
 *
 * Bu migration:
 *  1. is_deleted ustuniga bog'liq eski partial indexlarni o'chiradi
 *  2. ularning o'rniga deleted_at (yoki refresh_tokens uchun revoked_at)
 *     asosidagi ekvivalent indexlarni yaratadi
 *  3. is_deleted ustunlarini 8 ta jadvaldan tushiradi:
 *     users, workspaces, projects, tasks, groups, task_pushes,
 *     chat_messages, refresh_tokens
 */
export class DropIsDeletedColumns1783100000000 implements MigrationInterface {
  name = 'DropIsDeletedColumns1783100000000';

  private readonly tablesWithDeletedAt = [
    'users',
    'workspaces',
    'projects',
    'tasks',
    'groups',
    'task_pushes',
    'chat_messages',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Drop legacy is_deleted-dependent indexes ────────────────────
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_active_sessions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_token_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_user_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_messages_room"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ae4e352215f0356fe1a4262b4d"`);

    // ── 2. Recreate equivalent indexes using deleted_at / revoked_at ───
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_active_sessions"
      ON "refresh_tokens" ("user_id", "created_at")
      WHERE (revoked_at IS NULL)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token_hash"
      ON "refresh_tokens" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_email_active"
      ON "users" ("email")
      WHERE (deleted_at IS NULL AND is_active = true)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_messages_room"
      ON "chat_messages" ("room_id", "created_at")
      WHERE (deleted_at IS NULL)
    `);

    // ── 3. Drop is_deleted columns ──────────────────────────────────────
    for (const table of this.tablesWithDeletedAt) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "is_deleted"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "is_deleted"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Restore is_deleted columns (best-effort backfill from deleted_at) ──
    for (const table of this.tablesWithDeletedAt) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`,
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "is_deleted" = true WHERE "deleted_at" IS NOT NULL`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "is_deleted" = true WHERE "revoked_at" IS NOT NULL`,
    );

    // Drop the deleted_at-based indexes and restore is_deleted-based ones
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_messages_room"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_token_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_active_sessions"`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_messages_room"
      ON "chat_messages" ("room_id", "created_at")
      WHERE (is_deleted = false)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_email_active"
      ON "users" ("email")
      WHERE (is_deleted = false AND is_active = true)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token_hash"
      ON "refresh_tokens" ("token_hash")
      WHERE (is_deleted = false)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_active_sessions"
      ON "refresh_tokens" ("user_id", "created_at")
      WHERE (revoked_at IS NULL AND is_deleted = false)
    `);
  }
}
