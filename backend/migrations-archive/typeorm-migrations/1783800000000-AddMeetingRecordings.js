"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddMeetingRecordings1783800000000 = void 0;
class AddMeetingRecordings1783800000000 {
    name = 'AddMeetingRecordings1783800000000';
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "meeting_recordings_status_enum" AS ENUM ('recording', 'completed', 'failed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "meeting_recordings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "meeting_id" uuid NOT NULL,
        "started_by" uuid NOT NULL,
        "status" "meeting_recordings_status_enum" NOT NULL DEFAULT 'recording',
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "stopped_at" TIMESTAMP WITH TIME ZONE NULL,
        "duration_seconds" integer NULL,
        "auto_stopped" boolean NOT NULL DEFAULT false,
        "storage_key" text NULL,
        "storage_url" text NULL,
        "file_size" bigint NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_meeting_recordings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_meeting_recordings_meeting" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_meeting_recordings_started_by" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_meeting_recordings_meeting_id" ON "meeting_recordings" ("meeting_id");
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_meeting_recordings_one_active"
      ON "meeting_recordings" ("meeting_id")
      WHERE "status" = 'recording';
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "meeting_recordings"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "meeting_recordings_status_enum"`);
    }
}
exports.AddMeetingRecordings1783800000000 = AddMeetingRecordings1783800000000;
//# sourceMappingURL=1783800000000-AddMeetingRecordings.js.map