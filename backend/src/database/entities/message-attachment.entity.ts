import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { User } from './user.entity';

@Entity('message_attachments')
export class MessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_id' })
  messageId: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: ChatMessage;

  @Column({ name: 'uploader_id' })
  uploaderId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploader_id' })
  uploader: User;

  @Column({ name: 'file_name', length: 500 })
  fileName: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey: string;

  @Column({ name: 'storage_url', type: 'text' })
  storageUrl: string;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
