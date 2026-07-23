import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class NullablePasswordHash1779466278770 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
