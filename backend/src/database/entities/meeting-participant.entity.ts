import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { MeetingParticipantRole } from '../../common/enums/meeting.enum';
import { Meeting } from './meeting.entity';
import { User } from './user.entity';

@Entity('meeting_participants')
@Unique(['meetingId', 'userId'])
export class MeetingParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'meeting_id' })
  meetingId: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting: Meeting;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: MeetingParticipantRole,
    default: MeetingParticipantRole.PARTICIPANT,
  })
  role: MeetingParticipantRole;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date;

  @Column({ name: 'is_muted', default: false })
  isMuted: boolean;

  @Column({ name: 'camera_enabled', default: true })
  cameraEnabled: boolean;

  @Column({ name: 'screen_sharing', default: false })
  screenSharing: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
