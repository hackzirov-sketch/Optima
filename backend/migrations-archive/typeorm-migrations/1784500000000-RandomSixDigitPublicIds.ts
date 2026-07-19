import { MigrationInterface, QueryRunner } from 'typeorm';

export class RandomSixDigitPublicIds1784500000000 implements MigrationInterface {
  name = 'RandomSixDigitPublicIds1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public_user_id_registry (
        public_id integer PRIMARY KEY CHECK (public_id BETWEEN 100000 AND 999999),
        user_id uuid NOT NULL UNIQUE,
        assigned_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_protect_user_public_id ON users`);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reserve_six_digit_public_id(target_user uuid, preferred integer DEFAULT NULL)
      RETURNS integer LANGUAGE plpgsql AS $$
      DECLARE candidate integer;
      BEGIN
        IF preferred IS NOT NULL THEN
          INSERT INTO public_user_id_registry(public_id, user_id) VALUES (preferred, target_user);
          RETURN preferred;
        END IF;
        LOOP
          candidate := floor(random() * 900000 + 100000)::integer;
          INSERT INTO public_user_id_registry(public_id, user_id)
          VALUES (candidate, target_user) ON CONFLICT DO NOTHING;
          IF FOUND THEN RETURN candidate; END IF;
        END LOOP;
      END $$
    `);
    await queryRunner.query(`
      INSERT INTO public_user_id_registry(public_id, user_id)
      SELECT 777777, id FROM users WHERE public_id = 100000003
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`UPDATE users SET public_id = 777777 WHERE public_id = 100000003`);
    await queryRunner.query(`
      DO $$ DECLARE current_user_row record; assigned integer;
      BEGIN
        FOR current_user_row IN SELECT id FROM users WHERE public_id > 999999 LOOP
          assigned := reserve_six_digit_public_id(current_user_row.id);
          UPDATE users SET public_id = assigned WHERE id = current_user_row.id;
        END LOOP;
      END $$
    `);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN public_id DROP DEFAULT`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS users_public_id_seq`);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION assign_random_public_user_id()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.public_id IS NULL THEN NEW.public_id := reserve_six_digit_public_id(NEW.id); ELSE
          INSERT INTO public_user_id_registry(public_id, user_id) VALUES (NEW.public_id, NEW.id);
        END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`CREATE TRIGGER trg_assign_random_public_user_id BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION assign_random_public_user_id()`);
    await queryRunner.query(`CREATE TRIGGER trg_protect_user_public_id BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION protect_user_public_id()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_assign_random_public_user_id ON users`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS assign_random_public_user_id()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS reserve_six_digit_public_id(uuid, integer)`);
  }
}
