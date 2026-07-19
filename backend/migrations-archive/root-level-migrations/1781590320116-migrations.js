"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migrations1781590320116 = void 0;
class Migrations1781590320116 {
    name = 'Migrations1781590320116';
    async up(queryRunner) {
        await queryRunner.query(`
            ALTER TABLE "chat_messages"
            ADD COLUMN IF NOT EXISTS "content_json" jsonb
        `);
        await queryRunner.query(`
            ALTER TABLE "chat_rooms"
            ADD COLUMN IF NOT EXISTS "is_public" boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "invite_code" varchar(32)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_chat_rooms_invite_code"
            ON "chat_rooms" ("invite_code")
            WHERE "invite_code" IS NOT NULL
        `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_rooms_invite_code"`);
        await queryRunner.query(`
            ALTER TABLE "chat_rooms"
            DROP COLUMN IF EXISTS "invite_code",
            DROP COLUMN IF EXISTS "is_public"
        `);
        await queryRunner.query(`
            ALTER TABLE "chat_messages"
            DROP COLUMN IF EXISTS "content_json"
        `);
    }
}
exports.Migrations1781590320116 = Migrations1781590320116;
//# sourceMappingURL=1781590320116-migrations.js.map