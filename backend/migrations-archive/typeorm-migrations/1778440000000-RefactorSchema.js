"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefactorSchema1778440000000 = void 0;
class RefactorSchema1778440000000 {
    name = 'RefactorSchema1778440000000';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "first_name" character varying(50) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "last_name" character varying(50) NOT NULL DEFAULT ''`);
        await queryRunner.query(`
      UPDATE "users"
      SET
        "first_name" = TRIM(SPLIT_PART("full_name", ' ', 1)),
        "last_name"  = TRIM(
          SUBSTRING("full_name" FROM POSITION(' ' IN "full_name") + 1)
        )
      WHERE "full_name" IS NOT NULL AND "full_name" <> ''
    `);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "full_name"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "first_name" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "last_name" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone"`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "phone_number" bigint`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "device_name" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_address" character varying(45)`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "location" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_agent" text`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`);
        for (const table of [
            'workspaces',
            'projects',
            'tasks',
            'task_pushes',
            'groups',
        ]) {
            await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`);
        }
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_users_first_name" ON "users" ("first_name") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_active" ON "refresh_tokens" ("user_id", "revoked_at") WHERE "revoked_at" IS NULL AND "is_deleted" = false`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_first_name"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_user_active"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "last_used_at"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "user_agent"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "location"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "ip_address"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "device_name"`);
        for (const table of [
            'workspaces',
            'projects',
            'tasks',
            'task_pushes',
            'groups',
        ]) {
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "is_deleted"`);
        }
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_number"`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "full_name" character varying(100) NOT NULL DEFAULT ''`);
        await queryRunner.query(`
      UPDATE "users"
      SET "full_name" = TRIM("first_name" || ' ' || "last_name")
    `);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "full_name" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "phone" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "first_name"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_name"`);
    }
}
exports.RefactorSchema1778440000000 = RefactorSchema1778440000000;
//# sourceMappingURL=1778440000000-RefactorSchema.js.map