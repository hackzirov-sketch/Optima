import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateModerationTables1780500000000 implements MigrationInterface {
  name = 'CreateModerationTables1780500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ip_rate_limits" (
        "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
        "ip"           VARCHAR(45) NOT NULL,
        "action_type"  VARCHAR(100) NOT NULL,
        "count"        INTEGER     NOT NULL DEFAULT 1,
        "window_start" TIMESTAMPTZ NOT NULL,
        "blocked_until" TIMESTAMPTZ,
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ip_rate_limits" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ip_rate_limits_ip_action"
        ON "ip_rate_limits" ("ip", "action_type")
    `);

    await queryRunner.query(`
      CREATE TABLE "user_violations" (
        "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
        "user_id"      UUID        NOT NULL,
        "type"         VARCHAR(100) NOT NULL,
        "count"        INTEGER     NOT NULL DEFAULT 1,
        "blocked_until" TIMESTAMPTZ,
        "is_permanent" BOOLEAN     NOT NULL DEFAULT false,
        "reason"       TEXT,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_violations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_violations_user_id" ON "user_violations" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "banned_content" (
        "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
        "pattern"   TEXT         NOT NULL,
        "type"      VARCHAR(50)  NOT NULL DEFAULT 'text',
        "category"  VARCHAR(100),
        "severity"  VARCHAR(20)  NOT NULL DEFAULT 'medium',
        "is_regex"  BOOLEAN      NOT NULL DEFAULT false,
        "active"    BOOLEAN      NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_banned_content" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_banned_content_active_type" ON "banned_content" ("active", "type")
    `);


    await queryRunner.query(`
      INSERT INTO "banned_content" ("pattern", "type", "category", "severity", "is_regex", "active") VALUES
        -- Spam patterns (regex)
        ('(buy|sell|cheap).{0,20}(now|today|fast)', 'text', 'spam', 'low', true, true),
        ('(click|tap).{0,10}(here|link|below)', 'text', 'spam', 'low', true, true),
        ('(earn|make).{0,15}(money|cash|\\$).{0,10}(fast|quick|easy)', 'text', 'spam', 'medium', true, true),
        ('(free|gratis).{0,10}(prize|gift|money|iphone)', 'text', 'spam', 'medium', true, true),
        ('(whatsapp|telegram).{0,5}\\+?\\d{7,}', 'text', 'spam', 'medium', true, true),
        -- Phishing (regex)
        ('(password|parol).{0,20}(yubor|send|share|jo''nat)', 'text', 'phishing', 'high', true, true),
        ('(card|karta).{0,20}(number|raqam|cvv|pin)', 'text', 'phishing', 'high', true, true),
        -- Hate / slur placeholders (plain word, expand as needed)
        ('nigger', 'text', 'hate', 'high', false, true),
        ('faggot', 'text', 'hate', 'high', false, true)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "banned_content"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_violations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ip_rate_limits"`);
  }
}
