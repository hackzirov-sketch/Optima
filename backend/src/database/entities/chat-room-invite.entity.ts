import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { User } from './user.entity';

/**
 * Link-based room invite. Doesn't require email (unlike workspace_invitations).
 * Multiple active invites per room are allowed (e.g. one unlimited link for the
 * room description, one short-lived single-use link for a specific person).
 */
@Entity('chat_room_invites')
@Index(['roomId'])
export class ChatRoomInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id' })
  roomId: string;

  @ManyToOne(() => ChatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: ChatRoom;

  @Column({ name: 'created_by' })
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ length: 8, unique: true })
  code: string;

  /** null = unlimited uses */
  @Column({ name: 'max_uses', type: 'int', nullable: true })
  maxUses: number | null;

  @Column({ name: 'uses_count', type: 'int', default: 0 })
  usesCount: number;

  /** null = never expires */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
