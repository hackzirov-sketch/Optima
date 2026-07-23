"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddProviderInfo1779465742845 = void 0;
class AddProviderInfo1779465742845 {
    name = 'AddProviderInfo1779465742845';
    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."idx_users_email"`);
        await queryRunner.query(`DROP INDEX "public"."idx_users_username"`);
        await queryRunner.query(`DROP INDEX "public"."idx_users_first_name"`);
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_user_active"`);
        await queryRunner.query(`DROP INDEX "public"."idx_tasks_project"`);
        await queryRunner.query(`DROP INDEX "public"."idx_tasks_project_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_messages_room"`);
        await queryRunner.query(`DROP INDEX "public"."idx_notifications_unread"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "provider" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "user_ip_logs" ADD "provider" character varying(50)`);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id") `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_user_id"`);
        await queryRunner.query(`ALTER TABLE "user_ip_logs" DROP COLUMN "provider"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "provider"`);
        await queryRunner.query(`CREATE INDEX "idx_notifications_unread" ON "notifications" ("user_id") WHERE (is_read = false)`);
        await queryRunner.query(`CREATE INDEX "idx_messages_room" ON "chat_messages" ("room_id", "created_at") WHERE (is_deleted = false)`);
        await queryRunner.query(`CREATE INDEX "idx_tasks_project_status" ON "tasks" ("project_id", "status") WHERE (deleted_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "idx_tasks_project" ON "tasks" ("project_id", "position") WHERE (deleted_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_user_active" ON "refresh_tokens" ("user_id", "revoked_at") WHERE ((revoked_at IS NULL) AND (is_deleted = false))`);
        await queryRunner.query(`CREATE INDEX "idx_users_first_name" ON "users" ("first_name") WHERE (deleted_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "idx_users_username" ON "users" ("username") WHERE (deleted_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "idx_users_email" ON "users" ("email") WHERE (deleted_at IS NULL)`);
    }
}
exports.AddProviderInfo1779465742845 = AddProviderInfo1779465742845;
//# sourceMappingURL=1779465742845-AddProviderInfo.js.map