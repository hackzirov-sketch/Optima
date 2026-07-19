import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class DropIsDeletedColumns1783100000000 implements MigrationInterface {
    name: string;
    private readonly tablesWithDeletedAt;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
