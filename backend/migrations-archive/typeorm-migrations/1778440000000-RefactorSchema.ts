import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Refactor DB schema
 *
 * Changes:
 *  1. users: full_name → first_name + last_name
 *  2. users: phone varchar(20) → phone_number bigint
 *  3. users: add is_deleted boolean
 *  4. refresh_tokens: add device_name, ip_address, location, user_agent, last_used_at, is_deleted
 *
 * All existing tables already have soft-delete via deleted_at (timestamptz).
 * is_deleted (boolean) is an additional explicit flag for faster queries.
 */
export class RefactorSchema1778440000000 implements MigrationInterface {
  name = 'RefactorSchema1778440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. USERS TABLE ───────────────────────────────────────────────────

    // Add first_name & last_name columns
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "first_name" character varying(50) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "last_name" character varying(50) NOT NULL DEFAULT ''`,
    );

    // Migrate existing full_name data → first_name + last_name
    await queryRunner.query(`
      UPDATE "users"
      SET
        "first_name" = TRIM(SPLIT_PART("full_name", ' ', 1)),
        "last_name"  = TRIM(
          SUBSTRING("full_name" FROM POSITION(' ' IN "full_name") + 1)
        )
      WHERE "full_name" IS NOT NULL AND "full_name" <> ''
    `);

    // Drop old full_name column
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "full_name"`,
    );

    // Remove defaults (data migrated, defaults no longer needed)
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "first_name" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "last_name" DROP DEFAULT`,
    );

    // phone varchar → phone_number bigint
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "phone_number" bigint`,
    );

    // is_deleted boolean
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "is_deleted" boolean NOT NULL DEFAULT false`,
    );

    // ── 2. REFRESH_TOKENS TABLE ──────────────────────────────────────────

    // Session tracking columns
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "device_name" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_address" character varying(45)`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "location" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_agent" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`,
    );

    // ── 3. is_deleted FOR ALL SOFT-DELETE TABLES ─────────────────────────
    for (const table of [
      'workspaces',
      'projects',
      'tasks',
      'task_pushes',
      'groups',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`,
      );
    }

    // ── 4. INDEXES ───────────────────────────────────────────────────────

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_first_name" ON "users" ("first_name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_active" ON "refresh_tokens" ("user_id", "revoked_at") WHERE "revoked_at" IS NULL AND "is_deleted" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_first_name"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_user_active"`,
    );

    // Restore refresh_tokens columns
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "is_deleted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "last_used_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "user_agent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "location"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "ip_address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "device_name"`,
    );

    // Restore is_deleted from soft-delete tables
    for (const table of [
      'workspaces',
      'projects',
      'tasks',
      'task_pushes',
      'groups',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "is_deleted"`,
      );
    }
    // Restore users: drop new columns
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "is_deleted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_number"`,
    );

    // Restore users: recreate full_name from first + last
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "full_name" character varying(100) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(`
      UPDATE "users"
      SET "full_name" = TRIM("first_name" || ' ' || "last_name")
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "full_name" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "phone" character varying(20)`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "first_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "last_name"`,
    );
  }
}
