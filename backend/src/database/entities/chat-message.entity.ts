import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { User } from './user.entity';

@Index(['roomId', 'sequence'], { unique: true })
@Index(['roomId', 'senderId', 'clientMessageId'], { unique: true, where: 'client_message_id IS NOT NULL' })
@Index(['replyToId'])
@Index(['roomId', 'isDeleted', 'createdAt'])
@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id' })
  roomId!: string;

  @ManyToOne(() => ChatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room!: ChatRoom;

  @Column({ name: 'sender_id' })
  senderId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_id' })
  sender!: User;

  @Column({ name: 'reply_to_id', nullable: true })
  replyToId!: string | null;

  @ManyToOne(() => ChatMessage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reply_to_id' })
  replyTo!: ChatMessage | null;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ name: 'content_json', type: 'jsonb', nullable: true })
  contentJson!: { iv: string; data: string; v: number } | null;

  @Column({ name: 'content_type', length: 20, default: 'text' })
  contentType!: string;

  @Column({ name: 'is_edited', default: false })
  isEdited!: boolean;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt!: Date | null;

  @Column({ name: 'is_deleted', default: false })
  isDeleted!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @Column({ name: 'system_metadata', type: 'jsonb', nullable: true })
  systemMetadata!: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'int', nullable: true })
  sequence!: number;

  @Column({ name: 'client_message_id', type: 'varchar', length: 64, nullable: true })
  clientMessageId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: any;
}
