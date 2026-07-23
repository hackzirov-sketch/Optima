"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migrations1781590320116 = void 0;
class Migrations1781590320116 {
    name = 'Migrations1781590320116';
    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX "IDX_c86aeab3489909040377e37cf2" ON "tasks" ("workspace_id", "project_id", "deleted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_ae4e352215f0356fe1a4262b4d" ON "chat_messages" ("room_id", "is_deleted", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_af08fad7c04bb85403970afdc1" ON "notifications" ("user_id", "is_read") `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_af08fad7c04bb85403970afdc1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ae4e352215f0356fe1a4262b4d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c86aeab3489909040377e37cf2"`);
    }
}
exports.Migrations1781590320116 = Migrations1781590320116;
//# sourceMappingURL=1781590320116-AddPerformanceIndexes.js.map