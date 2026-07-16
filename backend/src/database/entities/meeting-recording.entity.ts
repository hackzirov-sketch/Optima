import { Meeting } from './meeting.entity';
import { User } from './user.entity';

export enum MeetingRecordingStatus {
  RECORDING = 'recording',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface MeetingRecording {
  id: string;

  meetingId: string;

  meeting: Meeting;

  startedBy: string;

  startedByUser: User;

  status: MeetingRecordingStatus;

  startedAt: Date;

  stoppedAt: Date | null;

  durationSeconds: number | null;

  autoStopped: boolean;

  storageKey: string | null;

  storageUrl: string | null;

  fileSize: number | null;

  createdAt: Date;

  updatedAt: Date;
}
