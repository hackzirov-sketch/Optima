import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEarningsTable1782000000000 implements MigrationInterface {
  name = 'CreateEarningsTable1782000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "earnings" (
        "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" UUID           NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "user_id"     UUID            NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "amount"      NUMERIC(12, 2)  NOT NULL,
        "currency"    VARCHAR(3)      NOT NULL DEFAULT 'USD',
        "description" TEXT,
        "date"        DATE            NOT NULL,
        "source_type" VARCHAR(50),
        "source_id"   UUID,
        "created_at"  TIMESTAMPTZ     NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_earnings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_earnings_workspace_date" ON "earnings" ("workspace_id", "date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_earnings_user_id" ON "earnings" ("user_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_earnings_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_earnings_workspace_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "earnings"`);
  }
}
