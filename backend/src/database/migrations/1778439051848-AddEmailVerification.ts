import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerification1778439051848 implements MigrationInterface {
  name = 'AddEmailVerification1778439051848';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "code" character varying(6) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3269a92433d028916ab342b94fb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2c6a037273f1cb3e6fdd832db2" ON "user_verifications" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "user_verifications" ADD CONSTRAINT "FK_2c6a037273f1cb3e6fdd832db24" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_verifications" DROP CONSTRAINT "FK_2c6a037273f1cb3e6fdd832db24"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2c6a037273f1cb3e6fdd832db2"`,
    );
    await queryRunner.query(`DROP TABLE "user_verifications"`);
  }
}
