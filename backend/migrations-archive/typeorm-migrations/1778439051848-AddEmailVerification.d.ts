import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddEmailVerification1778439051848 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
