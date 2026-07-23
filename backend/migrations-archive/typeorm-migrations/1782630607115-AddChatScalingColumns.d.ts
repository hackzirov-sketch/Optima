import { MigrationInterface, QueryRunner } from "typeorm";
export declare class AddChatScalingColumns1782630607115 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
