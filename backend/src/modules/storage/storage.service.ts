import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';

export type UploadFolder = 'avatars' | 'attachments' | 'workspace' | 'pushes';

const FOLDER_LIMITS: Record<UploadFolder, { maxBytes: number; mimeTypes: string[] | null }> = {
  avatars:     { maxBytes: 5 * 1024 * 1024,  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  workspace:   { maxBytes: 5 * 1024 * 1024,  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  attachments: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed',
      'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  pushes:      { maxBytes: 50 * 1024 * 1024, mimeTypes: null },
};

export interface CloudinarySignResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  uploadPreset?: string;
}

@Injectable()
export class StorageService {
  // ── R2 (used for push diff bundles) ───────────────────────────────────────
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly r2PublicUrl: string;
  private readonly logger = new Logger(StorageService.name);

  // ── Cloudinary ────────────────────────────────────────────────────────────
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseFolder: string;

  constructor(private readonly config: ConfigService) {
    // R2
    this.bucketName   = this.config.get<string>('r2.bucketName')!;
    this.r2PublicUrl  = this.config.get<string>('r2.publicUrl')!;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${this.config.get<string>('r2.accountId')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     this.config.get<string>('r2.accessKeyId')!,
        secretAccessKey: this.config.get<string>('r2.secretAccessKey')!,
      },
    });

    // Cloudinary
    this.cloudName  = this.config.get<string>('cloudinary.cloudName')!;
    this.apiKey     = this.config.get<string>('cloudinary.apiKey')!;
    this.apiSecret  = this.config.get<string>('cloudinary.apiSecret')!;
    this.baseFolder = this.config.get<string>('cloudinary.folder') ?? 'upz';

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key:    this.apiKey,
      api_secret: this.apiSecret,
      secure:     true,
    });
  }

  // ── Cloudinary: signed upload params ─────────────────────────────────────

  /**
   * Generate a signed upload envelope so the browser can POST directly to
   * Cloudinary without exposing the API secret.
   *
   * @param folder   One of the allowed upload folders
   * @param userId   Used to namespace the public_id (prevents collisions)
   * @param mimeType Optional MIME type for client-side pre-validation
   */
  signUpload(
    folder: UploadFolder,
    userId: string,
    mimeType?: string,
  ): CloudinarySignResult {
    const limits = FOLDER_LIMITS[folder];
    if (!limits) throw new BadRequestException(`Unknown folder: ${folder}`);

    if (mimeType && limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException(
        `Allowed types for ${folder}: ${limits.mimeTypes.join(', ')}`,
      );
    }

    const timestamp  = Math.round(Date.now() / 1000);
    const publicId   = `${this.baseFolder}/${folder}/${userId}/${uuidv4()}`;
    const cloudFolder = `${this.baseFolder}/${folder}`;

    const paramsToSign: Record<string, string | number> = {
      folder:    cloudFolder,
      public_id: publicId,
      timestamp,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey:    this.apiKey,
      cloudName: this.cloudName,
      folder:    cloudFolder,
      publicId,
    };
  }

  /** Returns the max file size in bytes for a given folder. */
  getMaxBytes(folder: UploadFolder): number {
    return FOLDER_LIMITS[folder]?.maxBytes ?? 5 * 1024 * 1024;
  }

  /** Delete a Cloudinary asset by public_id. */
  async deleteCloudinaryFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      this.logger.error(`Failed to delete Cloudinary asset: ${publicId}`, err);
    }
  }

  // ── R2: push diff bundles ─────────────────────────────────────────────────

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
    return { key, url: `${this.r2PublicUrl}/${key}` };
  }

  async uploadBase64(
    base64Data: string,
    prefix = 'pushes',
  ): Promise<{ key: string; url: string }> {
    const base64Content = base64Data.replace(/^data:.*,/, '');
    const buffer = Buffer.from(base64Content, 'base64');
    const key    = `${prefix}/${uuidv4()}.patch`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'text/plain',
      }),
    );
    return { key, url: `${this.r2PublicUrl}/${key}` };
  }

  async getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete R2 file: ${key}`, err);
    }
  }
}
