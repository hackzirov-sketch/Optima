"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOtimaCommunityResources1784200000000 = void 0;
class CreateOtimaCommunityResources1784200000000 {
    name = 'CreateOtimaCommunityResources1784200000000';
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "chat_rooms"
        ADD COLUMN IF NOT EXISTS "slug" varchar(100),
        ADD COLUMN IF NOT EXISTS "is_system" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "membership_locked" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "posting_mode" varchar(20) NOT NULL DEFAULT 'members',
        ADD COLUMN IF NOT EXISTS "linked_room_id" uuid
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_chat_rooms_system_slug"
      ON "chat_rooms" (lower("slug")) WHERE "is_system" = true
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "chat_rooms" ADD CONSTRAINT "FK_chat_rooms_linked_room"
          FOREIGN KEY ("linked_room_id") REFERENCES "chat_rooms"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
        await queryRunner.query(`
      ALTER TABLE "chat_members"
        ADD COLUMN IF NOT EXISTS "role" varchar(20) NOT NULL DEFAULT 'member',
        ADD COLUMN IF NOT EXISTS "is_banned" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "banned_until" timestamptz
    `);
        await queryRunner.query(`
      ALTER TABLE "chat_messages"
        ADD COLUMN IF NOT EXISTS "source_channel_message_id" uuid,
        ADD COLUMN IF NOT EXISTS "discussion_root_message_id" uuid,
        ADD COLUMN IF NOT EXISTS "is_pinned" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "view_count" integer NOT NULL DEFAULT 0
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_chat_messages_source_discussion"
      ON "chat_messages" ("source_channel_message_id")
      WHERE "source_channel_message_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
        await queryRunner.query(`
      INSERT INTO "chat_rooms"
        ("type", "visibility", "name", "description", "slug", "is_system",
         "membership_locked", "posting_mode", "is_public", "created_at", "updated_at")
      SELECT 'group'::chat_rooms_type_enum, 'public'::chat_rooms_visibility_enum,
        'OTIMA Community', 'OTIMA rasmiy yangiliklari va e''lonlari',
        'otima-community', true, true, 'admins_only', true, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM "chat_rooms" WHERE "slug" = 'otima-community')
    `);
        await queryRunner.query(`
      INSERT INTO "chat_rooms"
        ("type", "visibility", "name", "description", "slug", "is_system",
         "membership_locked", "posting_mode", "is_public", "created_at", "updated_at")
      SELECT 'group'::chat_rooms_type_enum, 'public'::chat_rooms_visibility_enum,
        'OTIMA Community Group', 'OTIMA hamjamiyati uchun umumiy muhokama guruhi',
        'otima-community-group', true, true, 'members', true, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM "chat_rooms" WHERE "slug" = 'otima-community-group')
    `);
        await queryRunner.query(`
      UPDATE "chat_rooms" c SET "linked_room_id" = g.id
      FROM "chat_rooms" g
      WHERE c.slug = 'otima-community' AND g.slug = 'otima-community-group'
    `);
        await queryRunner.query(`
      UPDATE "chat_rooms" g SET "linked_room_id" = c.id
      FROM "chat_rooms" c
      WHERE g.slug = 'otima-community-group' AND c.slug = 'otima-community'
    `);
        await queryRunner.query(`
      INSERT INTO "chat_members" ("room_id", "user_id", "status", "role", "joined_at")
      SELECT r.id, u.id, 'active',
        CASE WHEN u.id = (SELECT id FROM users WHERE is_active = true AND deleted_at IS NULL ORDER BY created_at, id LIMIT 1)
          THEN 'admin' ELSE 'member' END,
        now()
      FROM users u CROSS JOIN chat_rooms r
      WHERE u.is_active = true AND u.deleted_at IS NULL
        AND r.slug IN ('otima-community', 'otima-community-group')
      ON CONFLICT (room_id, user_id) DO UPDATE
        SET left_at = NULL, status = 'active'
    `);
        await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_otima_system_memberships()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO chat_members (room_id, user_id, status, role, joined_at)
        SELECT id, NEW.id, 'active', 'member', now()
        FROM chat_rooms WHERE slug IN ('otima-community', 'otima-community-group')
        ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL, status = 'active';
        RETURN NEW;
      END $$
    `);
        await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_users_otima_memberships ON users;
      CREATE TRIGGER trg_users_otima_memberships
      AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION ensure_otima_system_memberships()
    `);
        await queryRunner.query(`
      CREATE OR REPLACE FUNCTION protect_otima_system_room()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND OLD.is_system THEN
          RAISE EXCEPTION 'System chat resources cannot be deleted';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.is_system AND
          (NEW.slug IS DISTINCT FROM OLD.slug OR NEW.name IS DISTINCT FROM OLD.name OR
           NEW.is_system IS DISTINCT FROM OLD.is_system OR
           NEW.membership_locked IS DISTINCT FROM OLD.membership_locked) THEN
          RAISE EXCEPTION 'Immutable system chat fields cannot be changed';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END $$
    `);
        await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_protect_otima_system_room ON chat_rooms;
      CREATE TRIGGER trg_protect_otima_system_room
      BEFORE UPDATE OR DELETE ON chat_rooms FOR EACH ROW EXECUTE FUNCTION protect_otima_system_room()
    `);
        await queryRunner.query(`
      CREATE OR REPLACE FUNCTION protect_locked_chat_membership()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE locked boolean;
      BEGIN
        SELECT membership_locked INTO locked FROM chat_rooms WHERE id = OLD.room_id;
        IF locked AND (TG_OP = 'DELETE' OR NEW.left_at IS NOT NULL OR NEW.status <> 'active') THEN
          RAISE EXCEPTION 'Membership in this system chat is mandatory';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END $$
    `);
        await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_protect_locked_chat_membership ON chat_members;
      CREATE TRIGGER trg_protect_locked_chat_membership
      BEFORE UPDATE OR DELETE ON chat_members FOR EACH ROW EXECUTE FUNCTION protect_locked_chat_membership()
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_protect_locked_chat_membership ON chat_members`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS protect_locked_chat_membership()`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_protect_otima_system_room ON chat_rooms`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS protect_otima_system_room()`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_users_otima_memberships ON users`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS ensure_otima_system_memberships()`);
        await queryRunner.query(`DELETE FROM chat_rooms WHERE slug IN ('otima-community', 'otima-community-group')`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_chat_messages_source_discussion"`);
        await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS view_count, DROP COLUMN IF EXISTS is_pinned, DROP COLUMN IF EXISTS discussion_root_message_id, DROP COLUMN IF EXISTS source_channel_message_id`);
        await queryRunner.query(`ALTER TABLE chat_members DROP COLUMN IF EXISTS banned_until, DROP COLUMN IF EXISTS is_banned, DROP COLUMN IF EXISTS role`);
        await queryRunner.query(`ALTER TABLE chat_rooms DROP CONSTRAINT IF EXISTS "FK_chat_rooms_linked_room"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_chat_rooms_system_slug"`);
        await queryRunner.query(`ALTER TABLE chat_rooms DROP COLUMN IF EXISTS linked_room_id, DROP COLUMN IF EXISTS posting_mode, DROP COLUMN IF EXISTS membership_locked, DROP COLUMN IF EXISTS is_system, DROP COLUMN IF EXISTS slug`);
    }
}
exports.CreateOtimaCommunityResources1784200000000 = CreateOtimaCommunityResources1784200000000;
//# sourceMappingURL=1784200000000-CreateOtimaCommunityResources.js.map