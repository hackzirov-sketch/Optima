import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [ModerationModule],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
