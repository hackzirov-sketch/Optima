import { MeetingParticipantRole } from '../../common/enums/meeting.enum';
import { Meeting } from './meeting.entity';
import { User } from './user.entity';

export interface MeetingParticipant {
  id: string;

  meetingId: string;

  meeting: Meeting;

  userId: string;

  user: User;

  role: MeetingParticipantRole;

  joinedAt: Date | null;

  leftAt: Date | null;

  isMuted: boolean;

  cameraEnabled: boolean;

  screenSharing: boolean;

  createdAt: Date;
}
