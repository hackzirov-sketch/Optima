import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSchemaDrift1783500000000 implements MigrationInterface {
  name = 'FixSchemaDrift1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // tasks: missing columns used by TasksService (start/complete flows)
    await queryRunner.query(`
      ALTER TABLE "tasks"
      ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "tasks"
      ADD COLUMN IF NOT EXISTS "completion_note" TEXT
    `);

    // chat_messages: missing columns used by chat encryption + edit tracking
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD COLUMN IF NOT EXISTS "content_json" JSONB
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP WITH TIME ZONE
    `);

    // project_members: entity existed in code with no migration ever created — full table missing
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "project_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" character varying(20) NOT NULL DEFAULT 'member',
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "invited_by" uuid,
        "invited_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "joined_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_project_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_members_project_user" UNIQUE ("project_id", "user_id"),
        CONSTRAINT "FK_project_members_project" FOREIGN KEY ("project_id")
          REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_members_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_members_invited_by" FOREIGN KEY ("invited_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_project_members_project_id"
      ON "project_members" ("project_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_project_members_user_id"
      ON "project_members" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "project_members"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "edited_at"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "content_json"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN IF EXISTS "completion_note"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN IF EXISTS "started_at"`);
  }
}
