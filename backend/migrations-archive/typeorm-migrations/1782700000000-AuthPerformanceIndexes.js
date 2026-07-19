"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthPerformanceIndexes1782700000000 = void 0;
class AuthPerformanceIndexes1782700000000 {
    name = 'AuthPerformanceIndexes1782700000000';
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_active_sessions"
      ON "refresh_tokens" ("user_id", "created_at")
      WHERE (revoked_at IS NULL AND is_deleted = false)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token_hash"
      ON "refresh_tokens" ("token_hash")
      WHERE (is_deleted = false)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_email_active"
      ON "users" ("email")
      WHERE (is_deleted = false AND is_active = true)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_token_hash"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_active_sessions"`);
    }
}
exports.AuthPerformanceIndexes1782700000000 = AuthPerformanceIndexes1782700000000;
//# sourceMappingURL=1782700000000-AuthPerformanceIndexes.js.map