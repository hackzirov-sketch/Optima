"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddProvidersAndPasswordSetup1779466938712 = void 0;
class AddProvidersAndPasswordSetup1779466938712 {
    name = 'AddProvidersAndPasswordSetup1779466938712';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" ADD "providers" text NOT NULL DEFAULT 'local'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "needs_password_setup" boolean NOT NULL DEFAULT false`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "needs_password_setup"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "providers"`);
    }
}
exports.AddProvidersAndPasswordSetup1779466938712 = AddProvidersAndPasswordSetup1779466938712;
//# sourceMappingURL=1779466938712-AddProvidersAndPasswordSetup.js.map