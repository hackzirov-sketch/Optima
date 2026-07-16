import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-code.enum';
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
import { promises as fs } from 'fs';
import * as path from 'path';

export type UploadFolder = 'avatars' | 'attachments' | 'workspace' | 'pushes' | 'meeting-recordings' | 'meeting-files';

const FOLDER_LIMITS: Record<UploadFolder, { maxBytes: number; mimeTypes: string[] | null }> = {
  avatars:     { maxBytes: 5 * 1024 * 1024,  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  workspace:   { maxBytes: 5 * 1024 * 1024,  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  attachments: {
    // Telegram-style chat attachments — everything except round "video message" circles.
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: [
      // images
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
      // documents
      'application/pdf',
      'application/octet-stream',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
      // apps
      'application/vnd.android.package-archive', // .apk
      // video (regular files — not round "video message" bubbles)
      'video/mp4', 'video/webm', 'video/quicktime',
      // audio / voice notes
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
    ],
  },
  pushes:      { maxBytes: 50 * 1024 * 1024, mimeTypes: null },
  'meeting-files': {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'application/octet-stream', 'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
    ],
  },
  'meeting-recordings': {
    // 1-hour hard cap is enforced server-side on duration (see MeetingsService),
    // this is just a generous byte ceiling so a runaway/misbehaving client
    // can't upload an unbounded blob.
    maxBytes: 2560 * 1024 * 1024, // 2.5 GB
    mimeTypes: ['video/webm', 'video/mp4'],
  },
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
    if (!limits) throw new BadRequestException({ code: ErrorCode.STORAGE_INVALID_FOLDER, message: `Unknown folder: ${folder}` });

    if (mimeType && limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({ code: ErrorCode.STORAGE_INVALID_MIME, message: `Allowed types for ${folder}: ${limits.mimeTypes.join(', ')}` });
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

  async uploadChatAudio(buffer: Buffer, userId: string, mimeType: string) {
    const extensions: Record<string, string> = {
      'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    };
    const extension = extensions[mimeType];
    if (!extension) throw new BadRequestException({ code: ErrorCode.STORAGE_INVALID_MIME, message: 'Unsupported audio format' });
    const directory = path.resolve(process.cwd(), 'uploads', 'audio');
    await fs.mkdir(directory, { recursive: true });
    const fileName = `${userId}-${uuidv4()}.${extension}`;
    await fs.writeFile(path.join(directory, fileName), buffer, { mode: 0o600 });
    return { storageKey: `audio/${fileName}`, storageUrl: `/uploads/audio/${fileName}`, fileName, fileSize: buffer.length, mimeType };
  }

  async uploadChatAttachment(buffer: Buffer, userId: string, fileName: string, mimeType: string) {
    const limits = FOLDER_LIMITS.attachments;
    if (buffer.length > limits.maxBytes) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Chat files must be 100 MB or smaller' });
    }
    if (limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({ code: ErrorCode.STORAGE_INVALID_MIME, message: 'This file type is not supported' });
    }
    const extension = path.extname(fileName).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
    const storedName = `${userId}-${uuidv4()}${extension}`;
    const directory = path.resolve(process.cwd(), 'uploads', 'attachments');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, storedName), buffer, { mode: 0o600 });
    return {
      storageKey: `attachments/${storedName}`,
      storageUrl: `/uploads/attachments/${storedName}`,
      fileName,
      fileSize: buffer.length,
      mimeType,
    };
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

  /**
   * Generate a presigned PUT URL so the browser can upload a chat attachment
   * directly to R2 without the file passing through our API server.
   *
   * Flow: client calls this → PUTs the raw file bytes to `uploadUrl` with
   * header `Content-Type: <mimeType>` → then includes `{storageKey, storageUrl,
   * fileName, fileSize, mimeType}` in the `attachments` array when sending the
   * chat message.
   */
  async getPresignedUploadUrl(
    folder: UploadFolder,
    userId: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
  ): Promise<{ uploadUrl: string; storageKey: string; storageUrl: string; expiresIn: number }> {
    const limits = FOLDER_LIMITS[folder];
    if (!limits) throw new BadRequestException({ code: ErrorCode.STORAGE_INVALID_FOLDER, message: `Unknown folder: ${folder}` });

    if (limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({ code: ErrorCode.STORAGE_INVALID_MIME, message: `Allowed types for ${folder}: ${limits.mimeTypes.join(', ')}` });
    }
    if (fileSize > limits.maxBytes) {
      throw new BadRequestException({ code: ErrorCode.STORAGE_INVALID_MIME, message: `File exceeds max size of ${Math.round(limits.maxBytes / 1024 / 1024)}MB for ${folder}` });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
    const key = `${folder}/${userId}/${uuidv4()}-${safeName}`;
    const expiresIn = 300; // 5 min to complete the upload

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: mimeType,
    });
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      uploadUrl,
      storageKey: key,
      storageUrl: `${this.r2PublicUrl}/${key}`,
      expiresIn,
    };
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
