"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateMeetingSharedFiles1784100000000 = void 0;
class CreateMeetingSharedFiles1784100000000 {
    name = 'CreateMeetingSharedFiles1784100000000';
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "meeting_shared_files" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "meeting_id" uuid NOT NULL,
        "shared_by" uuid NOT NULL,
        "file_name" character varying(500) NOT NULL,
        "mime_type" character varying(200) NOT NULL,
        "file_size" bigint NOT NULL,
        "storage_key" text NOT NULL,
        "storage_url" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_meeting_shared_files" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_meeting_shared_files_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "FK_meeting_shared_files_meeting" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_meeting_shared_files_user" FOREIGN KEY ("shared_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_meeting_shared_files_meeting" ON "meeting_shared_files" ("meeting_id", "created_at" DESC)`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "meeting_shared_files"`);
    }
}
exports.CreateMeetingSharedFiles1784100000000 = CreateMeetingSharedFiles1784100000000;
//# sourceMappingURL=1784100000000-CreateMeetingSharedFiles.js.map