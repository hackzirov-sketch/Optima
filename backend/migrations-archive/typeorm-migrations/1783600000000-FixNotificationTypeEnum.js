"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixNotificationTypeEnum1783600000000 = void 0;
class FixNotificationTypeEnum1783600000000 {
    name = 'FixNotificationTypeEnum1783600000000';
    missingValues = [
        'task_completed',
        'task_status_changed',
        'project_member_invite',
        'project_member_accepted',
        'project_member_declined',
        'meeting_invite',
    ];
    async up(queryRunner) {
        for (const value of this.missingValues) {
            await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS '${value}'`);
        }
    }
    async down() {
    }
}
exports.FixNotificationTypeEnum1783600000000 = FixNotificationTypeEnum1783600000000;
//# sourceMappingURL=1783600000000-FixNotificationTypeEnum.js.map