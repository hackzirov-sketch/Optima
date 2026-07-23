import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeOccupationToString1783700000001 implements MigrationInterface {
  name = 'ChangeOccupationToString1783700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "occupation" TYPE VARCHAR(255)`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_occupation_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "users_occupation_enum" AS ENUM ('developer', 'designer', 'freelancer', 'project_manager', 'qa_engineer', 'devops_engineer', 'product_manager', 'student', 'other')`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "occupation" TYPE "users_occupation_enum" USING "occupation"::"text"::"users_occupation_enum"`);
  }
}
