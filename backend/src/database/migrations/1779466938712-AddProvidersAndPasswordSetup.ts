import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProvidersAndPasswordSetup1779466938712 implements MigrationInterface {
    name = 'AddProvidersAndPasswordSetup1779466938712'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "providers" text NOT NULL DEFAULT 'local'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "needs_password_setup" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "needs_password_setup"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "providers"`);
    }

}
