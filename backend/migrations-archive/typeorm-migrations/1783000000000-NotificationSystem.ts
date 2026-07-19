import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationSystem1783000000000 implements MigrationInterface {
  name = 'NotificationSystem1783000000000';

  async up(runner: QueryRunner): Promise<void> {
    // ── user_notification_prefs ──────────────────────────────────────────────
    await runner.query(`
      CREATE TABLE "user_notification_prefs" (
        "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id"                UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "telegram_chat_id"       BIGINT,
        "phone_verified"         BOOLEAN NOT NULL DEFAULT false,

        -- meeting
        "meeting_sms"            BOOLEAN NOT NULL DEFAULT true,
        "meeting_telegram"       BOOLEAN NOT NULL DEFAULT true,
        "meeting_email"          BOOLEAN NOT NULL DEFAULT true,
        "meeting_in_app"         BOOLEAN NOT NULL DEFAULT true,

        -- task
        "task_sms"               BOOLEAN NOT NULL DEFAULT false,
        "task_telegram"          BOOLEAN NOT NULL DEFAULT true,
        "task_email"             BOOLEAN NOT NULL DEFAULT false,
        "task_in_app"            BOOLEAN NOT NULL DEFAULT true,

        -- homework
        "homework_sms"           BOOLEAN NOT NULL DEFAULT false,
        "homework_telegram"      BOOLEAN NOT NULL DEFAULT true,
        "homework_email"         BOOLEAN NOT NULL DEFAULT false,
        "homework_in_app"        BOOLEAN NOT NULL DEFAULT true,

        -- payment
        "payment_sms"            BOOLEAN NOT NULL DEFAULT true,
        "payment_telegram"       BOOLEAN NOT NULL DEFAULT true,
        "payment_email"          BOOLEAN NOT NULL DEFAULT true,
        "payment_in_app"         BOOLEAN NOT NULL DEFAULT true,

        -- security
        "security_sms"           BOOLEAN NOT NULL DEFAULT true,
        "security_telegram"      BOOLEAN NOT NULL DEFAULT true,
        "security_email"         BOOLEAN NOT NULL DEFAULT true,
        "security_in_app"        BOOLEAN NOT NULL DEFAULT true,

        -- course
        "course_telegram"        BOOLEAN NOT NULL DEFAULT true,
        "course_in_app"          BOOLEAN NOT NULL DEFAULT true,

        -- marketing
        "marketing_telegram"     BOOLEAN NOT NULL DEFAULT false,
        "marketing_email"        BOOLEAN NOT NULL DEFAULT false,
        "marketing_in_app"       BOOLEAN NOT NULL DEFAULT true,

        -- certificate
        "certificate_telegram"   BOOLEAN NOT NULL DEFAULT true,
        "certificate_email"      BOOLEAN NOT NULL DEFAULT true,
        "certificate_in_app"     BOOLEAN NOT NULL DEFAULT true,

        -- quiet hours
        "quiet_start"            VARCHAR(5),
        "quiet_end"              VARCHAR(5),

        "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // ── notification_delivery_logs ───────────────────────────────────────────
    await runner.query(`
      CREATE TYPE "notification_channel_enum" AS ENUM ('in_app', 'email', 'telegram', 'sms')
    `);

    await runner.query(`
      CREATE TABLE "notification_delivery_logs" (
        "id"                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "notification_id"   UUID,
        "user_id"           UUID NOT NULL,
        "channel"           "notification_channel_enum" NOT NULL,
        "is_success"        BOOLEAN NOT NULL DEFAULT false,
        "error_message"     TEXT,
        "external_id"       VARCHAR(255),
        "is_read_on_channel" BOOLEAN NOT NULL DEFAULT false,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await runner.query(`CREATE INDEX "IDX_notif_delivery_notif_id" ON "notification_delivery_logs"("notification_id")`);
    await runner.query(`CREATE INDEX "IDX_notif_delivery_user_created" ON "notification_delivery_logs"("user_id", "created_at" DESC)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE "notification_delivery_logs"`);
    await runner.query(`DROP TYPE "notification_channel_enum"`);
    await runner.query(`DROP TABLE "user_notification_prefs"`);
  }
}
