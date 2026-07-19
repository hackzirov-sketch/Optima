"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddEmailVerification1778439051848 = void 0;
class AddEmailVerification1778439051848 {
    name = 'AddEmailVerification1778439051848';
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "user_verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "code" character varying(6) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3269a92433d028916ab342b94fb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2c6a037273f1cb3e6fdd832db2" ON "user_verifications" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "user_verifications" ADD CONSTRAINT "FK_2c6a037273f1cb3e6fdd832db24" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_verifications" DROP CONSTRAINT "FK_2c6a037273f1cb3e6fdd832db24"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2c6a037273f1cb3e6fdd832db2"`);
        await queryRunner.query(`DROP TABLE "user_verifications"`);
    }
}
exports.AddEmailVerification1778439051848 = AddEmailVerification1778439051848;
//# sourceMappingURL=1778439051848-AddEmailVerification.js.map