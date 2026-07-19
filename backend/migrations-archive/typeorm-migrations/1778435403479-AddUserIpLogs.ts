import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIpLogs1778435403479 implements MigrationInterface {
  name = 'AddUserIpLogs1778435403479';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_users_email"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_users_username"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_tasks_project"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_tasks_project_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_messages_room"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_notifications_unread"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_unread" ON "notifications" ("user_id") WHERE (is_read = false)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_room" ON "chat_messages" ("created_at", "room_id") WHERE (is_deleted = false)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tasks_project_status" ON "tasks" ("project_id", "status") WHERE (deleted_at IS NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tasks_project" ON "tasks" ("position", "project_id") WHERE (deleted_at IS NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_username" ON "users" ("username") WHERE (deleted_at IS NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_email" ON "users" ("email") WHERE (deleted_at IS NULL)`,
    );
  }
}
