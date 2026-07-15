import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restores `chat_rooms.type`, dropped by DecoupleChatMeetingsAddNotes on the
 * (unrealized) assumption that application code would derive room type from
 * workspace_id/group_id/project_id instead. That refactor was never finished
 * — room.service.ts, message.service.ts and member.service.ts still read/write
 * a stored `type` column — so every insert/select against chat_rooms started
 * failing. Re-adds the column with the enum aligned to the current
 * ChatRoomType (public/private/workspace/project/group/direct), and
 * best-effort backfills existing rows from group_id/project_id/member count
 * since the original values were lost when the column was dropped.
 */
export class RestoreChatRoomType1784200000000 implements MigrationInterface {
  name = 'RestoreChatRoomType1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "chat_rooms_type_enum" AS ENUM (
          'public', 'private', 'workspace', 'project', 'group', 'direct'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      ADD COLUMN IF NOT EXISTS "type" "chat_rooms_type_enum" NOT NULL DEFAULT 'group'
    `);

    // Best-effort backfill for rows created while the column was missing.
    await queryRunner.query(
      `UPDATE "chat_rooms" SET "type" = 'project' WHERE "project_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "chat_rooms" SET "type" = 'group' WHERE "group_id" IS NOT NULL AND "project_id" IS NULL`,
    );
    await queryRunner.query(`
      UPDATE "chat_rooms" r SET "type" = 'direct'
      WHERE r."group_id" IS NULL AND r."project_id" IS NULL
        AND (SELECT count(*) FROM "chat_members" cm WHERE cm."room_id" = r."id" AND cm."left_at" IS NULL) = 2
    `);
    await queryRunner.query(`
      UPDATE "chat_rooms" r SET "type" = 'workspace'
      WHERE r."group_id" IS NULL AND r."project_id" IS NULL AND r."type" = 'group'
        AND (SELECT count(*) FROM "chat_members" cm WHERE cm."room_id" = r."id" AND cm."left_at" IS NULL) != 2
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN IF EXISTS "type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chat_rooms_type_enum"`);
  }
}
