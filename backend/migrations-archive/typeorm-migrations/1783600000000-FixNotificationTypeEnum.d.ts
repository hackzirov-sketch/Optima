import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class FixNotificationTypeEnum1783600000000 implements MigrationInterface {
    name: string;
    private readonly missingValues;
    up(queryRunner: QueryRunner): Promise<void>;
    down(): Promise<void>;
}
