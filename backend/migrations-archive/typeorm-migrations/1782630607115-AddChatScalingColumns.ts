import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChatScalingColumns1782630607115 implements MigrationInterface {
    name = 'AddChatScalingColumns1782630607115'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD "sequence" integer`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD "client_message_id" character varying(64)`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD "metadata" jsonb`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD "message_seq" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "chat_members" ADD "last_read_seq" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`CREATE INDEX "IDX_46d19cf514d5c46a1f15598cf1" ON "chat_messages" ("reply_to_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4cdd51bfd9b9d5c3509c8522ce" ON "chat_messages" ("room_id", "sender_id", "client_message_id") WHERE client_message_id IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4c869ade23e6e8bab6df7acaed" ON "chat_messages" ("room_id", "sequence") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_4c869ade23e6e8bab6df7acaed"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4cdd51bfd9b9d5c3509c8522ce"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_46d19cf514d5c46a1f15598cf1"`);
        await queryRunner.query(`ALTER TABLE "chat_members" DROP COLUMN "last_read_seq"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "message_seq"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "metadata"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "client_message_id"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "sequence"`);
    }

}
