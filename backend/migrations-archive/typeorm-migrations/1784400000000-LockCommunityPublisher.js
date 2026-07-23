"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockCommunityPublisher1784400000000 = void 0;
class LockCommunityPublisher1784400000000 {
    name = 'LockCommunityPublisher1784400000000';
    async up(queryRunner) {
        await queryRunner.query(`
      UPDATE chat_members cm SET role = CASE WHEN u.public_id = 100000003 THEN 'admin' ELSE 'member' END
      FROM users u, chat_rooms r
      WHERE cm.user_id = u.id AND cm.room_id = r.id AND r.slug = 'otima-community'
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`UPDATE chat_members cm SET role = 'member' FROM chat_rooms r WHERE cm.room_id = r.id AND r.slug = 'otima-community'`);
    }
}
exports.LockCommunityPublisher1784400000000 = LockCommunityPublisher1784400000000;
//# sourceMappingURL=1784400000000-LockCommunityPublisher.js.map