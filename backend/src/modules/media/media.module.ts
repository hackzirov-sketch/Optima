import { Module } from '@nestjs/common';
import { YoutubeModule } from '../youtube/youtube.module';
import { MediaCountersService } from './media-counters.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [YoutubeModule],
  controllers: [MediaController],
  providers: [MediaService, MediaCountersService],
  exports: [MediaService, MediaCountersService],
})
export class MediaModule {}
