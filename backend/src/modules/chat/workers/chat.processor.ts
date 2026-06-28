import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoom } from '../../../database/entities/chat-room.entity';

@Processor('chat')
export class ChatProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatProcessor.name);

  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomRepo: Repository<ChatRoom>,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'update-room-metadata':
        return this.handleUpdateRoomMetadata(job.data);
      case 'message-side-effects':
        return this.handleMessageSideEffects(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleUpdateRoomMetadata(data: { roomId: string, sequence: number, lastMessageId: string, lastMessageAt: string }) {
    // This job dedups by roomId, so it processes the latest metadata
    await this.roomRepo.update(data.roomId, {
      messageSeq: data.sequence,
      lastMessageId: data.lastMessageId,
      lastMessageAt: new Date(data.lastMessageAt),
    });
    this.logger.debug(`Updated room ${data.roomId} metadata to sequence ${data.sequence}`);
  }

  private async handleMessageSideEffects(data: { messageId: string, roomId: string, senderId: string }) {
    // Side effects logic: Notifications, Analytics, Mentions, Search Index
    // For now, this is a placeholder.
    this.logger.debug(`Processed side effects for message ${data.messageId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} of type ${job.name} failed: ${err.message}`, err.stack);
  }
}
