"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddUserIpLogs1778435424535 = void 0;
class AddUserIpLogs1778435424535 {
    name = 'AddUserIpLogs1778435424535';
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "user_ip_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "ip_address" character varying(45) NOT NULL, "user_agent" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_600336ac6f0f0e9760207458001" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f17d339f7eba1d1d1488829453" ON "user_ip_logs" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "user_ip_logs" ADD CONSTRAINT "FK_f17d339f7eba1d1d14888294532" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_ip_logs" DROP CONSTRAINT "FK_f17d339f7eba1d1d14888294532"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f17d339f7eba1d1d1488829453"`);
        await queryRunner.query(`DROP TABLE "user_ip_logs"`);
    }
}
exports.AddUserIpLogs1778435424535 = AddUserIpLogs1778435424535;
//# sourceMappingURL=1778435424535-AddUserIpLogs.js.map