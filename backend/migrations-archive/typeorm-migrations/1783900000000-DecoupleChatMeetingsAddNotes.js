"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecoupleChatMeetingsAddNotes1783900000000 = void 0;
class DecoupleChatMeetingsAddNotes1783900000000 {
    name = 'DecoupleChatMeetingsAddNotes1783900000000';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_rooms" ALTER COLUMN "workspace_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN IF EXISTS "type"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "chat_rooms_type_enum"`);
        await queryRunner.query(`ALTER TABLE "meetings" ALTER COLUMN "workspace_id" DROP NOT NULL`);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NULL,
        "project_id" uuid NULL,
        "task_id" uuid NULL,
        "creator_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "content" text NOT NULL DEFAULT '',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE NULL,
        "deleted_by" uuid NULL,
        CONSTRAINT "PK_notes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notes_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notes_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notes_task" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notes_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notes_workspace" ON "notes" ("workspace_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notes_project" ON "notes" ("project_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notes_task" ON "notes" ("task_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notes_creator" ON "notes" ("creator_id")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "notes"`);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "chat_rooms_type_enum" AS ENUM ('workspace', 'group', 'project', 'direct', 'meeting');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD COLUMN "type" "chat_rooms_type_enum" NOT NULL DEFAULT 'group'`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ALTER COLUMN "workspace_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "meetings" ALTER COLUMN "workspace_id" SET NOT NULL`);
    }
}
exports.DecoupleChatMeetingsAddNotes1783900000000 = DecoupleChatMeetingsAddNotes1783900000000;
//# sourceMappingURL=1783900000000-DecoupleChatMeetingsAddNotes.js.map