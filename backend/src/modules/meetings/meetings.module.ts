import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../../database/entities/meeting.entity';
import { MeetingParticipant } from '../../database/entities/meeting-participant.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingParticipant]),
    WorkspacesModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
