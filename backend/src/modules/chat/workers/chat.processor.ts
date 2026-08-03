import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

@Processor('chat')
export class ChatProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatProcessor.name);

  constructor(private readonly dataSource: DatabaseService) {
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

  private async handleUpdateRoomMetadata(data: {
    roomId: string;
    sequence: number;
    lastMessageId: string;
    lastMessageAt: string;
  }) {
    // This job dedups by roomId, so it processes the latest metadata
    await this.dataSource.query(
      `UPDATE chat_rooms SET message_seq = $2, last_message_id = $3, last_message_at = $4 WHERE id = $1`,
      [
        data.roomId,
        data.sequence,
        data.lastMessageId,
        new Date(data.lastMessageAt),
      ],
    );
    this.logger.debug(
      `Updated room ${data.roomId} metadata to sequence ${data.sequence}`,
    );
  }

  // Placeholder: notifications, analytics, mentions and search indexing all
  // land here and will each be I/O, so the signature stays async even though
  // nothing awaits yet — callers already treat it as such.
  // eslint-disable-next-line @typescript-eslint/require-await
  private async handleMessageSideEffects(data: {
    messageId: string;
    roomId: string;
    senderId: string;
  }) {
    this.logger.debug(`Processed side effects for message ${data.messageId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.id} of type ${job.name} failed: ${err.message}`,
      err.stack,
    );
  }
}
