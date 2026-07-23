import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class NotificationSystem1783000000000 implements MigrationInterface {
    name: string;
    up(runner: QueryRunner): Promise<void>;
    down(runner: QueryRunner): Promise<void>;
}
