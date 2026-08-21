import { MeetingStatus } from '../../common/enums/meeting.enum';
import { RoomScope } from '../../common/enums';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export interface Meeting {
  id: string;

  // Nullable: a meeting no longer has to belong to a workspace — like
  // Google Meet, a standalone meeting can be created and joined by link/code
  // with no workspace context at all.
  workspaceId: string | null;

  workspace: Workspace | null;

  hostId: string;

  host: User;

  title: string;

  description: string | null;

  meetingCode: string;

  status: MeetingStatus;

  scope: RoomScope;

  startTime: Date;

  endTime: Date | null;

  maxParticipants: number;

  isRecurring: boolean;

  agenda: string | null;

  createdAt: Date;

  updatedAt: Date;

  /** Bumped on join/reactivate — drives the INACTIVE retention sweep, not user-facing. */
  lastActivityAt: Date;
}
