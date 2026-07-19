import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddPublicUserIdAndRemoveGeneral1784300000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
