"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskPushRepositoryNullable1783300000000 = void 0;
class TaskPushRepositoryNullable1783300000000 {
    name = 'TaskPushRepositoryNullable1783300000000';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "task_pushes" ALTER COLUMN "repository_id" DROP NOT NULL`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "task_pushes" ALTER COLUMN "repository_id" SET NOT NULL`);
    }
}
exports.TaskPushRepositoryNullable1783300000000 = TaskPushRepositoryNullable1783300000000;
//# sourceMappingURL=1783300000000-TaskPushRepositoryNullable.js.map