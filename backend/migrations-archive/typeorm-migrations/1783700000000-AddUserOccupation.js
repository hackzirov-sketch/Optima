"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddUserOccupation1783700000000 = void 0;
class AddUserOccupation1783700000000 {
    name = 'AddUserOccupation1783700000000';
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_occupation_enum" AS ENUM (
          'developer', 'designer', 'freelancer', 'project_manager',
          'qa_engineer', 'devops_engineer', 'product_manager', 'student', 'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "occupation" "users_occupation_enum" NULL;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "occupation";`);
        await queryRunner.query(`DROP TYPE IF EXISTS "users_occupation_enum";`);
    }
}
exports.AddUserOccupation1783700000000 = AddUserOccupation1783700000000;
//# sourceMappingURL=1783700000000-AddUserOccupation.js.map