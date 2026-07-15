import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1784134703304 implements MigrationInterface {
    name = 'Migrations1784134703304'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP CONSTRAINT "FK_0ab506d5205f68799f59438ea6a"`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" DROP CONSTRAINT "FK_chat_room_invites_room"`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" DROP CONSTRAINT "FK_chat_room_invites_created_by"`);
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "earnings_workspace_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "earnings_user_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_notes_workspace"`);
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_notes_project"`);
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_notes_task"`);
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_notes_creator"`);
        await queryRunner.query(`DROP INDEX "public"."idx_users_email_active"`);
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_active_sessions"`);
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_token_hash"`);
        await queryRunner.query(`DROP INDEX "public"."idx_messages_room"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_chat_rooms_invite_code"`);
        await queryRunner.query(`DROP INDEX "public"."idx_chat_room_invites_room_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_chat_room_invites_code_active"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_earnings_workspace_date"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_earnings_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notes_workspace"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notes_project"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notes_task"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notes_creator"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "visibility"`);
        await queryRunner.query(`DROP TYPE "public"."projects_visibility_enum"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "is_accepted"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "accepted_at"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "declined_at"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "decline_reason"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "is_public"`);
        await queryRunner.query(`ALTER TABLE "chat_members" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."chat_members_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."chat_rooms_type_enum" AS ENUM('public', 'private', 'workspace', 'project', 'group', 'direct')`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD "type" "public"."chat_rooms_type_enum" NOT NULL DEFAULT 'group'`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ALTER COLUMN "visibility" SET DEFAULT 'members_only'`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD CONSTRAINT "UQ_4203ad08a277036a3a81227ade0" UNIQUE ("invite_code")`);
        await queryRunner.query(`CREATE INDEX "IDX_dbf25e40923c7370686b8ba969" ON "chat_messages" ("room_id", "deleted_at", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_08e03b338be31d257bb5ed0b6a" ON "chat_room_invites" ("room_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_809b9c413ba61f8e5725e3c9a1" ON "earnings" ("workspace_id", "date") `);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD CONSTRAINT "FK_0ab506d5205f68799f59438ea6a" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" ADD CONSTRAINT "FK_08e03b338be31d257bb5ed0b6a3" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" ADD CONSTRAINT "FK_37ac254305f2871a95520789bf7" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "FK_fb48f10019942509ffd396213b3" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "FK_e6aae748382a08a712e42df8929" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_9d730754849395585397c08042e" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_64567ba716240b262710cfbfb0d" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_89398e8da167f82954f7b8c7d7d" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_d1b844ddf71a8fc99cf767a22d5" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_d1b844ddf71a8fc99cf767a22d5"`);
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_89398e8da167f82954f7b8c7d7d"`);
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_64567ba716240b262710cfbfb0d"`);
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_9d730754849395585397c08042e"`);
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "FK_e6aae748382a08a712e42df8929"`);
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "FK_fb48f10019942509ffd396213b3"`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" DROP CONSTRAINT "FK_37ac254305f2871a95520789bf7"`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" DROP CONSTRAINT "FK_08e03b338be31d257bb5ed0b6a3"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP CONSTRAINT "FK_0ab506d5205f68799f59438ea6a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_809b9c413ba61f8e5725e3c9a1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_08e03b338be31d257bb5ed0b6a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dbf25e40923c7370686b8ba969"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP CONSTRAINT "UQ_4203ad08a277036a3a81227ade0"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ALTER COLUMN "visibility" SET DEFAULT 'workspace_only'`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."chat_rooms_type_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."chat_members_status_enum" AS ENUM('pending', 'active')`);
        await queryRunner.query(`ALTER TABLE "chat_members" ADD "status" "public"."chat_members_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD "is_public" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD "decline_reason" text`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD "declined_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD "accepted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD "is_accepted" boolean`);
        await queryRunner.query(`CREATE TYPE "public"."projects_visibility_enum" AS ENUM('public', 'workspace', 'private')`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "visibility" "public"."projects_visibility_enum" NOT NULL DEFAULT 'workspace'`);
        await queryRunner.query(`CREATE INDEX "IDX_notes_creator" ON "notes" ("creator_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_notes_task" ON "notes" ("task_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_notes_project" ON "notes" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_notes_workspace" ON "notes" ("workspace_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_earnings_user_id" ON "earnings" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_earnings_workspace_date" ON "earnings" ("date", "workspace_id") `);
        await queryRunner.query(`CREATE INDEX "idx_chat_room_invites_code_active" ON "chat_room_invites" ("code") WHERE (revoked_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "idx_chat_room_invites_room_id" ON "chat_room_invites" ("room_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_chat_rooms_invite_code" ON "chat_rooms" ("invite_code") `);
        await queryRunner.query(`CREATE INDEX "idx_messages_room" ON "chat_messages" ("created_at", "room_id") WHERE (deleted_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash") `);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_active_sessions" ON "refresh_tokens" ("created_at", "user_id") WHERE (revoked_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "idx_users_email_active" ON "users" ("email") WHERE ((deleted_at IS NULL) AND (is_active = true))`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_notes_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_notes_task" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_notes_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_notes_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "earnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "earnings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" ADD CONSTRAINT "FK_chat_room_invites_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_room_invites" ADD CONSTRAINT "FK_chat_room_invites_room" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD CONSTRAINT "FK_0ab506d5205f68799f59438ea6a" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
