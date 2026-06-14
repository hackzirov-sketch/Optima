import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../../database/entities/meeting.entity';
import { MeetingParticipant } from '../../database/entities/meeting-participant.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingParticipant, WorkspaceMember]),
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
