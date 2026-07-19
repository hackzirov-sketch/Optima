"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DropIsDeletedColumns1783100000000 = void 0;
class DropIsDeletedColumns1783100000000 {
    name = 'DropIsDeletedColumns1783100000000';
    tablesWithDeletedAt = [
        'users',
        'workspaces',
        'projects',
        'tasks',
        'groups',
        'task_pushes',
        'chat_messages',
    ];
    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_active_sessions"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_token_hash"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_user_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_messages_room"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ae4e352215f0356fe1a4262b4d"`);
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
        for (const table of this.tablesWithDeletedAt) {
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "is_deleted"`);
        }
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "is_deleted"`);
    }
    async down(queryRunner) {
        for (const table of this.tablesWithDeletedAt) {
            await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`);
            await queryRunner.query(`UPDATE "${table}" SET "is_deleted" = true WHERE "deleted_at" IS NOT NULL`);
        }
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`UPDATE "refresh_tokens" SET "is_deleted" = true WHERE "revoked_at" IS NOT NULL`);
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
exports.DropIsDeletedColumns1783100000000 = DropIsDeletedColumns1783100000000;
//# sourceMappingURL=1783100000000-DropIsDeletedColumns.js.map