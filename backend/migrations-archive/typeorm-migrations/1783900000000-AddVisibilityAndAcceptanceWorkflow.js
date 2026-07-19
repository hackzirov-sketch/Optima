"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddVisibilityAndAcceptanceWorkflow1783900000000 = void 0;
class AddVisibilityAndAcceptanceWorkflow1783900000000 {
    name = 'AddVisibilityAndAcceptanceWorkflow1783900000000';
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE chat_rooms_visibility_enum AS ENUM (
          'public', 'invite_only', 'workspace_only', 'members_only'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
        await queryRunner.query(`
      ALTER TABLE chat_rooms
      ADD COLUMN IF NOT EXISTS visibility chat_rooms_visibility_enum NOT NULL DEFAULT 'workspace_only';
    `);
        await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'chat_rooms'
          AND column_name = 'workspace_id'
        ) THEN
          ALTER TABLE chat_rooms ALTER COLUMN workspace_id DROP NOT NULL;
        END IF;
      END $$;
    `);
        await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'chat_rooms'
          AND column_name = 'created_by'
        ) THEN
          ALTER TABLE chat_rooms ALTER COLUMN created_by DROP NOT NULL;
        END IF;
      END $$;
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE meetings_visibility_enum AS ENUM (
          'public', 'workspace', 'private', 'selected_users'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
        await queryRunner.query(`
      ALTER TABLE meetings
      ADD COLUMN IF NOT EXISTS visibility meetings_visibility_enum NOT NULL DEFAULT 'private';
    `);
        await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'meetings'
          AND column_name = 'workspace_id'
        ) THEN
          ALTER TABLE meetings ALTER COLUMN workspace_id DROP NOT NULL;
        END IF;
      END $$;
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE projects_visibility_enum AS ENUM (
          'public', 'workspace', 'private'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
        await queryRunner.query(`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS visibility projects_visibility_enum NOT NULL DEFAULT 'workspace';
    `);
        await queryRunner.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS decline_reason TEXT DEFAULT NULL;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE tasks
      DROP COLUMN IF EXISTS is_accepted,
      DROP COLUMN IF EXISTS accepted_at,
      DROP COLUMN IF EXISTS declined_at,
      DROP COLUMN IF EXISTS decline_reason;
    `);
        await queryRunner.query(`
      ALTER TABLE projects DROP COLUMN IF EXISTS visibility;
    `);
        await queryRunner.query(`
      DROP TYPE IF EXISTS projects_visibility_enum;
    `);
        await queryRunner.query(`
      ALTER TABLE meetings DROP COLUMN IF EXISTS visibility;
    `);
        await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'meetings'
          AND column_name = 'workspace_id'
        ) THEN
          ALTER TABLE meetings ALTER COLUMN workspace_id SET NOT NULL;
        END IF;
      END $$;
    `);
        await queryRunner.query(`
      DROP TYPE IF EXISTS meetings_visibility_enum;
    `);
        await queryRunner.query(`
      ALTER TABLE chat_rooms DROP COLUMN IF EXISTS visibility;
    `);
        await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'chat_rooms'
          AND column_name = 'workspace_id'
        ) THEN
          ALTER TABLE chat_rooms ALTER COLUMN workspace_id SET NOT NULL;
        END IF;
      END $$;
    `);
        await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'chat_rooms'
          AND column_name = 'created_by'
        ) THEN
          ALTER TABLE chat_rooms ALTER COLUMN created_by SET NOT NULL;
        END IF;
      END $$;
    `);
        await queryRunner.query(`
      DROP TYPE IF EXISTS chat_rooms_visibility_enum;
    `);
    }
}
exports.AddVisibilityAndAcceptanceWorkflow1783900000000 = AddVisibilityAndAcceptanceWorkflow1783900000000;
//# sourceMappingURL=1783900000000-AddVisibilityAndAcceptanceWorkflow.js.map