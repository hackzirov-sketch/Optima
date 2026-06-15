import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { UserSettings } from '../../database/entities/user-settings.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSettings, RefreshToken]), ModerationModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
