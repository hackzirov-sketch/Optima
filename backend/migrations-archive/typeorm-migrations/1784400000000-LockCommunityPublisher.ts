import { MigrationInterface, QueryRunner } from 'typeorm';

export class LockCommunityPublisher1784400000000 implements MigrationInterface {
  name = 'LockCommunityPublisher1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE chat_members cm SET role = CASE WHEN u.public_id = 100000003 THEN 'admin' ELSE 'member' END
      FROM users u, chat_rooms r
      WHERE cm.user_id = u.id AND cm.room_id = r.id AND r.slug = 'otima-community'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE chat_members cm SET role = 'member' FROM chat_rooms r WHERE cm.room_id = r.id AND r.slug = 'otima-community'`);
  }
}
