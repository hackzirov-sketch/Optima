import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `occupation` to `users` — a self-selected profession at signup
 * (developer / designer / freelancer / etc). Nullable + no default so
 * existing accounts simply show "not set" until they fill it in from
 * settings; the frontend treats null as "prefer not to say".
 */
export class AddUserOccupation1783700000000 implements MigrationInterface {
  name = 'AddUserOccupation1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_occupation_enum" AS ENUM (
          'developer', 'designer', 'freelancer', 'project_manager',
          'qa_engineer', 'devops_engineer', 'product_manager', 'student', 'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "occupation" "users_occupation_enum" NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "occupation";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_occupation_enum";`);
  }
}
