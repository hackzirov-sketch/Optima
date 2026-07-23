import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Screen/session recording for meetings. Actual video capture happens
 * client-side (MediaRecorder); this table tracks the recording's lifecycle
 * and, once uploaded, where the file lives in R2. Server enforces a hard
 * 1-hour cap on recording duration (see MeetingsService.startRecording /
 * the meeting-recording BullMQ queue's auto-stop job) regardless of what
 * the client does.
 */
export class AddMeetingRecordings1783800000000 implements MigrationInterface {
  name = 'AddMeetingRecordings1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

    // At most one active ('recording') recording per meeting at a time.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_meeting_recordings_one_active"
      ON "meeting_recordings" ("meeting_id")
      WHERE "status" = 'recording';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "meeting_recordings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "meeting_recordings_status_enum"`);
  }
}
