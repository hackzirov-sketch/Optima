import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the separate, inconsistent ChatVisibility (public/invite_only/
 * workspace_only/members_only) and MeetingVisibility (public/workspace/
 * private/selected_users) enums with one shared `scope` column + enum
 * (workspace_only/private/public) on both chat_rooms and meetings. Both
 * tables represent the same concept — a realtime collaboration space that
 * may or may not be tied to a workspace — so they should share one model
 * instead of drifting independently.
 *
 * Also adds a CHECK constraint enforcing the actual design rule: a
 * workspace_only room/meeting must have a workspace_id; private/public ones
 * don't need one.
 */
export class ConsolidateRoomScope1784300000000 implements MigrationInterface {
  name = 'ConsolidateRoomScope1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "room_scope_enum" AS ENUM ('workspace_only', 'private', 'public');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // ── chat_rooms ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "chat_rooms" ADD COLUMN IF NOT EXISTS "scope" "room_scope_enum" NOT NULL DEFAULT 'workspace_only'
    `);
    await queryRunner.query(`
      UPDATE "chat_rooms" SET "scope" = CASE "visibility"
        WHEN 'public' THEN 'public'::room_scope_enum
        WHEN 'workspace_only' THEN 'workspace_only'::room_scope_enum
        ELSE 'private'::room_scope_enum
      END
      WHERE "visibility" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN IF EXISTS "visibility"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chat_rooms_visibility_enum"`);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms" ADD CONSTRAINT "chk_chat_rooms_scope_workspace"
      CHECK ("scope" != 'workspace_only' OR "workspace_id" IS NOT NULL)
    `);

    // ── meetings ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "scope" "room_scope_enum" NOT NULL DEFAULT 'workspace_only'
    `);
    await queryRunner.query(`
      UPDATE "meetings" SET "scope" = CASE "visibility"
        WHEN 'public' THEN 'public'::room_scope_enum
        WHEN 'workspace' THEN 'workspace_only'::room_scope_enum
        ELSE 'private'::room_scope_enum
      END
      WHERE "visibility" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "meetings" DROP COLUMN IF EXISTS "visibility"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "meetings_visibility_enum"`);
    await queryRunner.query(`
      ALTER TABLE "meetings" ADD CONSTRAINT "chk_meetings_scope_workspace"
      CHECK ("scope" != 'workspace_only' OR "workspace_id" IS NOT NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "chk_meetings_scope_workspace"`);
    await queryRunner.query(`ALTER TABLE "chat_rooms" DROP CONSTRAINT IF EXISTS "chk_chat_rooms_scope_workspace"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "meetings_visibility_enum" AS ENUM ('public', 'workspace', 'private', 'selected_users');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "meetings" ADD COLUMN "visibility" "meetings_visibility_enum" NOT NULL DEFAULT 'private'`,
    );
    await queryRunner.query(`
      UPDATE "meetings" SET "visibility" = CASE "scope"
        WHEN 'public' THEN 'public'::meetings_visibility_enum
        WHEN 'workspace_only' THEN 'workspace'::meetings_visibility_enum
        ELSE 'private'::meetings_visibility_enum
      END
    `);
    await queryRunner.query(`ALTER TABLE "meetings" DROP COLUMN "scope"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "chat_rooms_visibility_enum" AS ENUM ('public', 'invite_only', 'workspace_only', 'members_only');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "chat_rooms" ADD COLUMN "visibility" "chat_rooms_visibility_enum" NOT NULL DEFAULT 'members_only'`,
    );
    await queryRunner.query(`
      UPDATE "chat_rooms" SET "visibility" = CASE "scope"
        WHEN 'public' THEN 'public'::chat_rooms_visibility_enum
        WHEN 'workspace_only' THEN 'workspace_only'::chat_rooms_visibility_enum
        ELSE 'members_only'::chat_rooms_visibility_enum
      END
    `);
    await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "scope"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "room_scope_enum"`);
  }
}
