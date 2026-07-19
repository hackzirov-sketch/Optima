import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddChatRoomPublicInvite1783400000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
