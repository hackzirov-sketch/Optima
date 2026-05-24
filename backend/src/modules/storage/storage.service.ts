import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {
    this.bucketName = this.config.get<string>('r2.bucketName')!;
    this.publicUrl = this.config.get<string>('r2.publicUrl')!;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${this.config.get<string>('r2.accountId')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.config.get<string>('r2.accessKeyId')!,
        secretAccessKey: this.config.get<string>('r2.secretAccessKey')!,
      },
    });
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<{ key: string; url: string }> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return {
      key,
      url: `${this.publicUrl}/${key}`,
    };
  }

  async uploadBase64(
    base64Data: string,
    prefix = 'pushes',
  ): Promise<{ key: string; url: string }> {
    // Remove data URI prefix if present
    const base64Content = base64Data.replace(/^data:.*,/, '');
    const buffer = Buffer.from(base64Content, 'base64');

    const key = `${prefix}/${uuidv4()}.patch`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'text/plain',
      }),
    );

    return {
      key,
      url: `${this.publicUrl}/${key}`,
    };
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to delete file from R2: ${key}`, error);
    }
  }
}
