import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { LastSeenFlushService } from './services/last-seen-flush.service';
import { UsersController } from './controllers/users.controller';
import { ModerationModule } from '../moderation/moderation.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ModerationModule, StorageModule],
  controllers: [UsersController],
  providers: [UsersService, LastSeenFlushService],
  exports: [UsersService],
})
export class UsersModule {}
