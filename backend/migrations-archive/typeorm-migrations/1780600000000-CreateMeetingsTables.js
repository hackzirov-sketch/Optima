"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateMeetingsTables1780600000000 = void 0;
class CreateMeetingsTables1780600000000 {
    name = 'CreateMeetingsTables1780600000000';
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TYPE "meeting_status_enum" AS ENUM ('scheduled', 'live', 'ended', 'cancelled')
    `);
        await queryRunner.query(`
      CREATE TYPE "meeting_participant_role_enum" AS ENUM ('host', 'co_host', 'participant')
    `);
        await queryRunner.query(`
      CREATE TABLE "meetings" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id"     UUID          NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "host_id"          UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title"            VARCHAR(200)  NOT NULL,
        "description"      TEXT,
        "meeting_code"     VARCHAR(20)   NOT NULL UNIQUE,
        "status"           "meeting_status_enum" NOT NULL DEFAULT 'scheduled',
        "start_time"       TIMESTAMPTZ   NOT NULL,
        "end_time"         TIMESTAMPTZ,
        "max_participants" INTEGER       NOT NULL DEFAULT 100,
        "is_recurring"     BOOLEAN       NOT NULL DEFAULT false,
        "agenda"           TEXT,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_meetings" PRIMARY KEY ("id")
      )
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_meetings_workspace_id" ON "meetings" ("workspace_id")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_meetings_host_id" ON "meetings" ("host_id")
    `);
        await queryRunner.query(`
      CREATE TABLE "meeting_participants" (
        "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
        "meeting_id"     UUID          NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
        "user_id"        UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role"           "meeting_participant_role_enum" NOT NULL DEFAULT 'participant',
        "joined_at"      TIMESTAMPTZ,
        "left_at"        TIMESTAMPTZ,
        "is_muted"       BOOLEAN       NOT NULL DEFAULT false,
        "camera_enabled" BOOLEAN       NOT NULL DEFAULT true,
        "screen_sharing" BOOLEAN       NOT NULL DEFAULT false,
        "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_meeting_participants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_meeting_participants_meeting_user" UNIQUE ("meeting_id", "user_id")
      )
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_meeting_participants_meeting_id" ON "meeting_participants" ("meeting_id")
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "meeting_participants"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "meetings"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "meeting_participant_role_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "meeting_status_enum"`);
    }
}
exports.CreateMeetingsTables1780600000000 = CreateMeetingsTables1780600000000;
//# sourceMappingURL=1780600000000-CreateMeetingsTables.js.map