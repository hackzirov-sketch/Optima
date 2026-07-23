"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddChatRoomPublicInvite1783400000000 = void 0;
class AddChatRoomPublicInvite1783400000000 {
    name = 'AddChatRoomPublicInvite1783400000000';
    async up(queryRunner) {
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
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_chat_rooms_invite_code"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN IF EXISTS "invite_code"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN IF EXISTS "is_public"`);
    }
}
exports.AddChatRoomPublicInvite1783400000000 = AddChatRoomPublicInvite1783400000000;
//# sourceMappingURL=1783400000000-AddChatRoomPublicInvite.js.map