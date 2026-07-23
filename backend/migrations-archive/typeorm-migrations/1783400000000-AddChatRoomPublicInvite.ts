import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatRoomPublicInvite1783400000000 implements MigrationInterface {
  name = 'AddChatRoomPublicInvite1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      ADD COLUMN IF NOT EXISTS "is_public" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      ADD COLUMN IF NOT EXISTS "invite_code" character varying(32)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_chat_rooms_invite_code"
      ON "chat_rooms" ("invite_code")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_chat_rooms_invite_code"`);
    await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN IF EXISTS "invite_code"`);
    await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN IF EXISTS "is_public"`);
  }
}
