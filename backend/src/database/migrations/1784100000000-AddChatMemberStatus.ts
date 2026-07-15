import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatMemberStatus1784100000000 implements MigrationInterface {
  name = 'AddChatMemberStatus1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the enum type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "chat_members_status_enum" AS ENUM ('pending', 'active');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add the column with default 'active' (all existing members are already active)
    await queryRunner.query(`
      ALTER TABLE "chat_members"
      ADD COLUMN IF NOT EXISTS "status" "chat_members_status_enum" NOT NULL DEFAULT 'active'
    `);

    // Add CHAT_INVITE to notifications type enum if not already there
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notifications_type_enum"
          ADD VALUE IF NOT EXISTS 'chat_invite';
      EXCEPTION WHEN others THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notifications_type_enum"
          ADD VALUE IF NOT EXISTS 'chat_invite_accepted';
      EXCEPTION WHEN others THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notifications_type_enum"
          ADD VALUE IF NOT EXISTS 'chat_invite_declined';
      EXCEPTION WHEN others THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_members" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chat_members_status_enum"`);
  }
}
