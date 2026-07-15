import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicUserIdAndRemoveGeneral1784300000000 implements MigrationInterface {
  name = 'AddPublicUserIdAndRemoveGeneral1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS users_public_id_seq START WITH 100000001 INCREMENT BY 1 NO CYCLE`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id bigint`);
    await queryRunner.query(`WITH numbered AS (SELECT id, 100000000 + row_number() OVER (ORDER BY created_at, id) AS public_id FROM users) UPDATE users u SET public_id = n.public_id FROM numbered n WHERE u.id = n.id AND u.public_id IS NULL`);
    await queryRunner.query(`SELECT setval('users_public_id_seq', GREATEST(100000000, COALESCE((SELECT max(public_id) FROM users), 100000000)))`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN public_id SET DEFAULT nextval('users_public_id_seq'), ALTER COLUMN public_id SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_public_id" ON users(public_id)`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN username DROP NOT NULL`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION protect_user_public_id() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN RAISE EXCEPTION 'Public user ID is immutable'; END IF; RETURN NEW; END $$`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_protect_user_public_id ON users; CREATE TRIGGER trg_protect_user_public_id BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION protect_user_public_id()`);
    await queryRunner.query(`DELETE FROM chat_rooms WHERE is_system = false AND lower(name) = 'general' AND workspace_id IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_protect_user_public_id ON users`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS protect_user_public_id()`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN username SET NOT NULL`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_public_id"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS public_id`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS users_public_id_seq`);
  }
}
