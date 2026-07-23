import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * System design v2 §4.1 — chat_room_invites
 * Link-based invites for chat rooms, independent of workspace_invitations
 * (no email required, multiple active codes per room, optional max_uses / expiry).
 */
export class CreateChatRoomInvites1783200000000 implements MigrationInterface {
  name = 'CreateChatRoomInvites1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_room_invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "room_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "code" character varying(8) NOT NULL,
        "max_uses" integer,
        "uses_count" integer NOT NULL DEFAULT 0,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_room_invites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_room_invites_code" UNIQUE ("code"),
        CONSTRAINT "FK_chat_room_invites_room" FOREIGN KEY ("room_id")
          REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_room_invites_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_chat_room_invites_room_id" ON "chat_room_invites" ("room_id")
    `);

    // Fast lookup of active invites by code (join flow)
    await queryRunner.query(`
      CREATE INDEX "idx_chat_room_invites_code_active"
      ON "chat_room_invites" ("code")
      WHERE (revoked_at IS NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_room_invites_code_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_room_invites_room_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_room_invites"`);
  }
}
