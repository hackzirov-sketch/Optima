"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddChatMemberStatus1784100000000 = void 0;
class AddChatMemberStatus1784100000000 {
    name = 'AddChatMemberStatus1784100000000';
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "chat_members_status_enum" AS ENUM ('pending', 'active');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
        await queryRunner.query(`
      ALTER TABLE "chat_members"
      ADD COLUMN IF NOT EXISTS "status" "chat_members_status_enum" NOT NULL DEFAULT 'active'
    `);
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
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_members" DROP COLUMN IF EXISTS "status"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "chat_members_status_enum"`);
    }
}
exports.AddChatMemberStatus1784100000000 = AddChatMemberStatus1784100000000;
//# sourceMappingURL=1784100000000-AddChatMemberStatus.js.map