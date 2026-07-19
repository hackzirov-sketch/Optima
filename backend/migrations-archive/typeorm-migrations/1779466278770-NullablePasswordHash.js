"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullablePasswordHash1779466278770 = void 0;
class NullablePasswordHash1779466278770 {
    name = 'NullablePasswordHash1779466278770';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL`);
    }
}
exports.NullablePasswordHash1779466278770 = NullablePasswordHash1779466278770;
//# sourceMappingURL=1779466278770-NullablePasswordHash.js.map