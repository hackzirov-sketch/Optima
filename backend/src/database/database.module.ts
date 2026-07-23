import { Global, Module } from '@nestjs/common';
import { PG_POOL, createPgPool } from './database-provider';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: createPgPool }, DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
