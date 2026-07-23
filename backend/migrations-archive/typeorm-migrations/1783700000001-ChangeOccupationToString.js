"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeOccupationToString1783700000001 = void 0;
class ChangeOccupationToString1783700000001 {
    name = 'ChangeOccupationToString1783700000001';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "occupation" TYPE VARCHAR(255)`);
        await queryRunner.query(`DROP TYPE IF EXISTS "users_occupation_enum"`);
    }
    async down(queryRunner) {
        await queryRunner.query(`CREATE TYPE "users_occupation_enum" AS ENUM ('developer', 'designer', 'freelancer', 'project_manager', 'qa_engineer', 'devops_engineer', 'product_manager', 'student', 'other')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "occupation" TYPE "users_occupation_enum" USING "occupation"::"text"::"users_occupation_enum"`);
    }
}
exports.ChangeOccupationToString1783700000001 = ChangeOccupationToString1783700000001;
//# sourceMappingURL=1783700000001-ChangeOccupationToString.js.map