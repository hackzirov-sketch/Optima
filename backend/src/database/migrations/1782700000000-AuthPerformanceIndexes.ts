import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthPerformanceIndexes1782700000000 implements MigrationInterface {
  name = 'AuthPerformanceIndexes1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite partial index for enforceSessionLimit + getSessions queries
    // WHERE revoked_at IS NULL AND is_deleted = false ORDER BY created_at
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_active_sessions"
      ON "refresh_tokens" ("user_id", "created_at")
      WHERE (revoked_at IS NULL AND is_deleted = false)
    `);

    // Index for findByTokenHash (used on every /refresh and /logout)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token_hash"
      ON "refresh_tokens" ("token_hash")
      WHERE (is_deleted = false)
    `);

    // Index for users.email lookup on login (partial — active users only)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_email_active"
      ON "users" ("email")
      WHERE (is_deleted = false AND is_active = true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_token_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_active_sessions"`);
  }
}
