import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1782647235336 implements MigrationInterface {
    name = 'Migrations1782647235336'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "earnings_workspace_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "earnings_user_id_fkey"`);
        await queryRunner.query(`DROP INDEX "public"."idx_chat_rooms_invite_code"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_earnings_workspace_date"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_earnings_user_id"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD CONSTRAINT "UQ_4203ad08a277036a3a81227ade0" UNIQUE ("invite_code")`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" RENAME TO "notifications_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('task_assigned', 'task_updated', 'task_commented', 'push_submitted', 'push_approved', 'push_rejected', 'pr_created', 'pr_reviewed', 'pr_merged', 'project_created', 'project_updated', 'member_joined', 'member_role_changed', 'mention', 'workspace_invite', 'task_completed', 'task_status_changed', 'project_member_invite', 'project_member_accepted', 'project_member_declined', 'meeting_invite')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum" USING "type"::"text"::"public"."notifications_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_809b9c413ba61f8e5725e3c9a1" ON "earnings" ("workspace_id", "date") `);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "FK_fb48f10019942509ffd396213b3" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "FK_e6aae748382a08a712e42df8929" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "FK_e6aae748382a08a712e42df8929"`);
        await queryRunner.query(`ALTER TABLE "earnings" DROP CONSTRAINT "FK_fb48f10019942509ffd396213b3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_809b9c413ba61f8e5725e3c9a1"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum_old" AS ENUM('task_assigned', 'task_updated', 'task_commented', 'push_submitted', 'push_approved', 'push_rejected', 'pr_created', 'pr_reviewed', 'pr_merged', 'project_created', 'project_updated', 'member_joined', 'member_role_changed', 'mention', 'workspace_invite')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum_old" USING "type"::"text"::"public"."notifications_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum_old" RENAME TO "notifications_type_enum"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP CONSTRAINT "UQ_4203ad08a277036a3a81227ade0"`);
        await queryRunner.query(`CREATE INDEX "IDX_earnings_user_id" ON "earnings" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_earnings_workspace_date" ON "earnings" ("date", "workspace_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_chat_rooms_invite_code" ON "chat_rooms" ("invite_code") WHERE (invite_code IS NOT NULL)`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "earnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "earnings" ADD CONSTRAINT "earnings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
