import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1782808583034 implements MigrationInterface {
    name = 'Migrations1782808583034'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "earnings_workspace_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "earnings_user_id_fkey"`);
        await queryRunner.query(`DROP INDEX "public"."idx_users_email_active"`);
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_active_sessions"`);
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_token_hash"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ae4e352215f0356fe1a4262b4d"`);
        await queryRunner.query(`DROP INDEX "public"."idx_chat_rooms_invite_code"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_earnings_workspace_date"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_earnings_user_id"`);
        await queryRunner.query(`CREATE TABLE "chat_room_invites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "room_id" uuid NOT NULL, "created_by" uuid NOT NULL, "code" character varying(8) NOT NULL, "max_uses" integer, "uses_count" integer NOT NULL DEFAULT '0', "expires_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9f8b7aa8323f1890dde5df0b371" UNIQUE ("code"), CONSTRAINT "PK_06e84d43b27c763c8067f7ab16f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_08e03b338be31d257bb5ed0b6a" ON "chat_room_invites" ("room_id") `);
        await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "task_pushes" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "task_pushes" DROP CONSTRAINT "FK_4a5a17546667671d2c7652c4c99"`);
        await queryRunner.query(`ALTER TABLE "task_pushes" ALTER COLUMN "repository_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD CONSTRAINT "UQ_4203ad08a277036a3a81227ade0" UNIQUE ("invite_code")`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" RENAME TO "notifications_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('task_assigned', 'task_updated', 'task_commented', 'push_submitted', 'push_approved', 'push_rejected', 'pr_created', 'pr_reviewed', 'pr_merged', 'project_created', 'project_updated', 'member_joined', 'member_role_changed', 'mention', 'workspace_invite', 'task_completed', 'task_status_changed', 'project_member_invite', 'project_member_accepted', 'project_member_declined', 'meeting_invite')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum" USING "type"::"text"::"public"."notifications_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_dbf25e40923c7370686b8ba969" ON "chat_messages" ("room_id", "deleted_at", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_809b9c413ba61f8e5725e3c9a1" ON "earnings" ("workspace_id", "date") `);
        await queryRunner.query(`ALTER TABLE "task_pushes" ADD CONSTRAINT "FK_4a5a17546667671d2c7652c4c99" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" ADD CONSTRAINT "FK_08e03b338be31d257bb5ed0b6a3" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" ADD CONSTRAINT "FK_37ac254305f2871a95520789bf7" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "FK_fb48f10019942509ffd396213b3" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "FK_e6aae748382a08a712e42df8929" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "FK_e6aae748382a08a712e42df8929"`);
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "FK_fb48f10019942509ffd396213b3"`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" DROP CONSTRAINT "FK_37ac254305f2871a95520789bf7"`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" DROP CONSTRAINT "FK_08e03b338be31d257bb5ed0b6a3"`);
        await queryRunner.query(`ALTER TABLE "task_pushes" DROP CONSTRAINT "FK_4a5a17546667671d2c7652c4c99"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_809b9c413ba61f8e5725e3c9a1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dbf25e40923c7370686b8ba969"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum_old" AS ENUM('task_assigned', 'task_updated', 'task_commented', 'push_submitted', 'push_approved', 'push_rejected', 'pr_created', 'pr_reviewed', 'pr_merged', 'project_created', 'project_updated', 'member_joined', 'member_role_changed', 'mention', 'workspace_invite')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum_old" USING "type"::"text"::"public"."notifications_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum_old" RENAME TO "notifications_type_enum"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP CONSTRAINT "UQ_4203ad08a277036a3a81227ade0"`);
        await queryRunner.query(`ALTER TABLE "task_pushes" ALTER COLUMN "repository_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "task_pushes" ADD CONSTRAINT "FK_4a5a17546667671d2c7652c4c99" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "task_pushes" ADD "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "groups" ADD "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "workspaces" ADD "is_deleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`DROP INDEX "public"."IDX_08e03b338be31d257bb5ed0b6a"`);
        await queryRunner.query(`DROP TABLE "chat_room_invites"`);
        await queryRunner.query(`CREATE INDEX "IDX_earnings_user_id" ON "earnings" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_earnings_workspace_date" ON "earnings" ("date", "workspace_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_chat_rooms_invite_code" ON "chat_rooms" ("invite_code") WHERE (invite_code IS NOT NULL)`);
        await queryRunner.query(`CREATE INDEX "IDX_ae4e352215f0356fe1a4262b4d" ON "chat_messages" ("created_at", "is_deleted", "room_id") `);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash") WHERE (is_deleted = false)`);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_active_sessions" ON "refresh_tokens" ("created_at", "user_id") WHERE ((revoked_at IS NULL) AND (is_deleted = false))`);
        await queryRunner.query(`CREATE INDEX "idx_users_email_active" ON "users" ("email") WHERE ((is_deleted = false) AND (is_active = true))`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "earnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "earnings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
