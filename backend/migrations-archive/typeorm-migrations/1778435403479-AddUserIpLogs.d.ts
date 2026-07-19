import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddUserIpLogs1778435403479 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
