import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDmEnumValue1780700000000 implements MigrationInterface {
  name = 'AddDmEnumValue1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."chat_rooms_type_enum" ADD VALUE IF NOT EXISTS 'dm'`,
    );
    await queryRunner.query(
      `UPDATE "chat_rooms" SET "type" = 'dm' WHERE "type" = 'direct'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "chat_rooms" SET "type" = 'direct' WHERE "type" = 'dm'`,
    );
  }
}
