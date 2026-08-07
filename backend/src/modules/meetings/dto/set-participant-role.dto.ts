import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { MeetingParticipantRole } from '../../../common/enums/meeting.enum';

/**
 * Only the two roles a host may hand out. `host` is deliberately absent —
 * there is exactly one, it comes from meetings.host_id, and granting it here
 * would put the two out of sync.
 */
export class SetParticipantRoleDto {
  @ApiProperty({
    enum: [MeetingParticipantRole.CO_HOST, MeetingParticipantRole.PARTICIPANT],
  })
  @IsIn([MeetingParticipantRole.CO_HOST, MeetingParticipantRole.PARTICIPANT])
  role!: MeetingParticipantRole.CO_HOST | MeetingParticipantRole.PARTICIPANT;
}
