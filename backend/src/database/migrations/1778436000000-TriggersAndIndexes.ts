import { MigrationInterface, QueryRunner } from "typeorm";

export class TriggersAndIndexes1778436000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. TRIGGERS & FUNCTIONS ──────────────────────────────────────

        // Updated_at function
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
              NEW.updated_at = NOW();
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Apply updated_at triggers
        const tablesWithUpdatedAt = [
            'users', 'workspaces', 'projects', 'tasks', 
            'task_pushes', 'chat_messages', 'chat_rooms'
        ];
        for (const table of tablesWithUpdatedAt) {
            await queryRunner.query(`
                CREATE TRIGGER trg_${table}_updated_at
                BEFORE UPDATE ON ${table}
                FOR EACH ROW EXECUTE FUNCTION update_updated_at();
            `);
        }

        // Task number auto-increment function
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION assign_task_number()
            RETURNS TRIGGER AS $$
            BEGIN
              INSERT INTO task_sequences (project_id, last_number)
              VALUES (NEW.project_id, 1)
              ON CONFLICT (project_id) DO UPDATE
                SET last_number = task_sequences.last_number + 1;

              SELECT last_number INTO NEW.task_number
              FROM task_sequences
              WHERE project_id = NEW.project_id;

              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_task_number
            BEFORE INSERT ON tasks
            FOR EACH ROW EXECUTE FUNCTION assign_task_number();
        `);

        // Project progress recalculation function
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION recalculate_project_progress()
            RETURNS TRIGGER AS $$
            DECLARE
              v_total INT;
              v_done  INT;
            BEGIN
              SELECT
                COUNT(*) FILTER (WHERE deleted_at IS NULL AND parent_task_id IS NULL),
                COUNT(*) FILTER (WHERE deleted_at IS NULL AND parent_task_id IS NULL AND status = 'done')
              INTO v_total, v_done
              FROM tasks
              WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);

              UPDATE projects
              SET progress = CASE WHEN v_total = 0 THEN 0 ELSE (v_done * 100 / v_total) END
              WHERE id = COALESCE(NEW.project_id, OLD.project_id);

              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_task_progress
            AFTER INSERT OR UPDATE OF status OR DELETE ON tasks
            FOR EACH ROW EXECUTE FUNCTION recalculate_project_progress();
        `);

        // Room last message update function
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_room_last_message()
            RETURNS TRIGGER AS $$
            BEGIN
              UPDATE chat_rooms
              SET last_message_id = NEW.id, last_message_at = NEW.created_at
              WHERE id = NEW.room_id;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_room_last_message
            AFTER INSERT ON chat_messages
            FOR EACH ROW EXECUTE FUNCTION update_room_last_message();
        `);

        // ── 2. ADDITIONAL INDEXES (Production-grade) ─────────────────────
        
        await queryRunner.query(`CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX idx_tasks_project ON tasks(project_id, position) WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX idx_tasks_project_status ON tasks(project_id, status) WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX idx_messages_room ON chat_messages(room_id, created_at DESC) WHERE is_deleted = false`);
        await queryRunner.query(`CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop triggers
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_users_updated_at ON users`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON workspaces`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_task_pushes_updated_at ON task_pushes`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_chat_messages_updated_at ON chat_messages`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_chat_rooms_updated_at ON chat_rooms`);
        
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_task_number ON tasks`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_task_progress ON tasks`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_room_last_message ON chat_messages`);

        // Drop functions
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at()`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS assign_task_number()`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS recalculate_project_progress()`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_room_last_message()`);

        // Drop indexes
        await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_users_username`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_project`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_project_status`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_messages_room`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_notifications_unread`);
    }
}
