import { Module } from '@nestjs/common';
import { YoutubeController } from './youtube.controller';
import { VideoFeedService } from './video-feed.service';
import { YoutubeService } from './youtube.service';

@Module({
  controllers: [YoutubeController],
  providers: [YoutubeService, VideoFeedService],
  exports: [YoutubeService, VideoFeedService],
})
export class YoutubeModule {}
