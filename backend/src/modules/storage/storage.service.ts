import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';

export type UploadFolder =
  | 'avatars'
  | 'backgrounds'
  | 'attachments'
  | 'group'
  | 'pushes'
  | 'meeting-recordings';

/**
 * `formats`, where set, is folded into the *signature* as Cloudinary's
 * `allowed_formats` — Cloudinary then rejects a mismatched upload itself. That
 * matters because everything the browser sends alongside a signature is
 * client-controlled: the `mimeType` passed to signUpload is a claim, not a
 * constraint, so without this an "avatars, image/png" signature would happily
 * accept an executable. Size has no equivalent signed upload parameter, so it
 * is enforced after the fact by verifyUploadedAsset().
 */
const FOLDER_LIMITS: Record<
  UploadFolder,
  { maxBytes: number; mimeTypes: string[] | null; formats?: string[] }
> = {
  avatars: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  },
  backgrounds: {
    maxBytes: 8 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  },
  group: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
  attachments: {
    // Telegram-style chat attachments — everything except round "video message" circles.
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: [
      // images
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      // documents
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      // apps
      'application/vnd.android.package-archive', // .apk
      // video (regular files — not round "video message" bubbles)
      'video/mp4',
      'video/webm',
      'video/quicktime',
      // audio / voice notes
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/x-m4a',
      // Encrypted on the sender's device (E2EE chats) — opaque to the server.
      'application/vnd.optima.e2ee',
    ],
  },
  pushes: { maxBytes: 50 * 1024 * 1024, mimeTypes: null },
  'meeting-recordings': {
    // 1-hour hard cap is enforced server-side on duration (see MeetingsService),
    // this is just a generous byte ceiling so a runaway/misbehaving client
    // can't upload an unbounded blob.
    maxBytes: 2560 * 1024 * 1024, // 2.5 GB
    mimeTypes: ['video/webm', 'video/mp4'],
  },
};

/**
 * What a browser needs to upload a file straight to storage, without it
 * passing through the API. R2 takes a presigned PUT of the raw bytes;
 * Cloudinary takes a multipart POST of the signed `fields` plus `file`, and
 * answers with the final `secure_url` (the `storageUrl` here is only the
 * unversioned form of it).
 */
export interface DirectUploadTicket {
  provider: 'r2' | 'cloudinary';
  method: 'PUT' | 'POST';
  uploadUrl: string;
  fields?: Record<string, string>;
  storageKey: string;
  storageUrl: string;
  expiresIn: number;
}

export interface CloudinarySignResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  /** Signed `allowed_formats`; the client must echo it back on upload. */
  allowedFormats?: string;
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

  /**
   * Whether object storage is actually usable. Missing credentials still build
   * a perfectly valid-looking S3Client — pointed at a host that resolves to
   * nothing — so every presigned URL handed to a browser was a URL to nowhere
   * and every upload died at the PUT with a generic "couldn't upload" toast.
   * Configuration missing is a different problem from an upload failing, and
   * the API should say which one it is.
   */
  private readonly storageConfigured: boolean;

  /** Backend for direct uploads, long messages and push bundles — see cloudinary.config.ts. */
  private readonly provider: 'cloudinary' | 'r2';

  constructor(private readonly config: ConfigService) {
    this.bucketName = this.config.get<string>('storage.bucketName')!;
    this.r2PublicUrl = this.config.get<string>('storage.publicUrl')!;
    const accessKeyId = this.config.get<string>('storage.accessKeyId');
    const secretAccessKey = this.config.get<string>('storage.secretAccessKey');
    const endpoint = this.config.get<string>('storage.endpoint');
    const region = this.config.get<string>('storage.region');

    // A region alone is enough for AWS (the SDK derives the host from it); an
    // endpoint alone is enough for R2 and MinIO. Neither present means nothing
    // has been configured at all.
    this.storageConfigured = Boolean(
      accessKeyId && secretAccessKey && this.bucketName && (endpoint || region),
    );
    if (!this.storageConfigured) {
      this.logger.warn(
        'Object storage is not configured (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET / S3_REGION, or the R2_* equivalents) — direct uploads will be refused',
      );
    }

    this.s3Client = new S3Client({
      region: region ?? 'us-east-1',
      // Only when there is one to give: handing AWS an endpoint overrides the
      // region-derived host, which is exactly what must not happen there.
      ...(endpoint ? { endpoint } : {}),
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });

    // Cloudinary
    this.cloudName = this.config.get<string>('cloudinary.cloudName')!;
    this.apiKey = this.config.get<string>('cloudinary.apiKey')!;
    this.apiSecret = this.config.get<string>('cloudinary.apiSecret')!;
    this.baseFolder = this.config.get<string>('cloudinary.folder') ?? 'upz';
    this.provider =
      this.config.get<'cloudinary' | 'r2'>('cloudinary.storageProvider') ??
      'cloudinary';
    if (
      this.provider === 'cloudinary' &&
      !(this.cloudName && this.apiKey && this.apiSecret)
    ) {
      this.logger.warn(
        'Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) — uploads will be refused',
      );
    }

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
  }

  /**
   * Confirms an attachment the client is asking us to persist actually came
   * out of one of our own upload paths, and belongs to the caller.
   *
   * Every upload route here is careful — the presigned PUT signs both
   * `Content-Length` and `Content-Type`, Cloudinary gets an `allowed_formats`
   * allowlist folded into the signature — but none of that binds the *result*
   * to the message. The send-message payload carries `storageUrl` as a plain
   * string, so a client could skip the upload entirely and attach any URL it
   * likes: the chat then renders an attacker's host as a file card inside a
   * conversation the recipient trusts, with an attacker-chosen `fileName` and
   * `mimeType` on it. Malware delivery and phishing, wearing our UI.
   *
   * Two things are checked, and both have to hold:
   *  - the URL sits under a host we actually upload to (R2 public bucket or
   *    the configured Cloudinary cloud), so it can only ever point at our own
   *    storage;
   *  - the caller's id appears as a path segment, which is how every key here
   *    is minted (`<folder>/<userId>/<uuid>`), so one user cannot attach
   *    another user's private object by guessing its key.
   */
  assertOwnedAttachment(
    storageUrl: string,
    storageKey: string,
    userId: string,
  ): void {
    const reject = (message: string): never => {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_FOLDER,
        message,
      });
    };

    let parsed: URL;
    try {
      parsed = new URL(storageUrl);
    } catch {
      return reject('Attachment URL is not a valid URL');
    }
    if (parsed.protocol !== 'https:') {
      return reject('Attachment URL must be https');
    }

    const allowedHosts = new Set<string>();
    if (this.r2PublicUrl) {
      try {
        allowedHosts.add(new URL(this.r2PublicUrl).host);
      } catch {
        // Misconfigured R2_PUBLIC_URL — fall through to the Cloudinary host.
      }
    }
    if (this.cloudName) {
      allowedHosts.add('res.cloudinary.com');
    }
    if (!allowedHosts.has(parsed.host)) {
      return reject('Attachment URL does not point at UPZ storage');
    }
    // Cloudinary serves every account off the same host, so the host alone
    // says nothing — the cloud name is the tenant boundary.
    if (
      parsed.host === 'res.cloudinary.com' &&
      !parsed.pathname.startsWith(`/${this.cloudName}/`)
    ) {
      return reject('Attachment URL does not point at UPZ storage');
    }

    if (!storageKey.split('/').includes(userId)) {
      return reject('You can only attach your own uploads');
    }

    // The ownership check above reads the *key*, but what is stored and later
    // rendered is the *URL* — and nothing tied the two together. Presenting
    // your own key alongside somebody else's URL satisfied both checks and
    // attached their file to your message. Same tie
    // the meeting-recording stop path makes, adjusted for how each provider
    // builds its URLs: R2 serves the object key verbatim, while Cloudinary
    // appends a delivery format to the public_id (`.../upz/audio/<id>/x.webm`
    // for the key `upz/audio/<id>/x`), so the extension is stripped before
    // comparing rather than the check being skipped for that host.
    const path = decodeURIComponent(parsed.pathname);
    const withoutFormat = path.replace(/\.[A-Za-z0-9]{1,8}$/, '');
    if (
      !path.endsWith(`/${storageKey}`) &&
      !withoutFormat.endsWith(`/${storageKey}`)
    ) {
      return reject('Attachment URL does not match its storage key');
    }
  }

  /**
   * DNS and socket failures that mean "we never reached Cloudinary", as
   * opposed to "Cloudinary answered and said no". The distinction matters:
   * these are transient and say nothing about the asset, so they must never be
   * reported as a bad request from the user.
   */
  private static readonly TRANSPORT_ERROR_CODES = new Set([
    'EAI_AGAIN', // DNS lookup failed — the one that took the server down
    'ENOTFOUND',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'ENETUNREACH',
    'EHOSTUNREACH',
  ]);

  private static isTransportError(err: unknown): boolean {
    const code = (err as { code?: unknown; errno?: unknown })?.code;
    return (
      typeof code === 'string' && StorageService.TRANSPORT_ERROR_CODES.has(code)
    );
  }

  /**
   * Runs a Cloudinary call and turns a lost connection into a clean 503.
   *
   * Without this a DNS blip (`getaddrinfo EAI_AGAIN api.cloudinary.com`)
   * escaped as a raw Error: the global filter logged it as "Unhandled
   * Exception" with a stack trace and returned an opaque 500, so an outage at
   * the image host looked to everyone like a broken backend. One retry covers
   * the common case where the resolver recovers immediately; anything longer
   * is a real outage and is reported as one.
   */
  private async callCloudinary<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await run();
      } catch (err) {
        if (!StorageService.isTransportError(err)) throw err;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
        this.logger.error(
          `Cloudinary unreachable during ${operation}: ${(err as Error).message}`,
        );
        throw new ServiceUnavailableException({
          code: ErrorCode.STORAGE_PROVIDER_UNAVAILABLE,
          message:
            'The file service is temporarily unreachable — try again shortly',
        });
      }
    }
    // Unreachable: the loop either returns or throws.
    throw new ServiceUnavailableException({
      code: ErrorCode.STORAGE_PROVIDER_UNAVAILABLE,
      message: 'The file service is temporarily unreachable',
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
    if (!limits)
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_FOLDER,
        message: `Unknown folder: ${folder}`,
      });

    if (mimeType && limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_MIME,
        message: `Allowed types for ${folder}: ${limits.mimeTypes.join(', ')}`,
      });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `${this.baseFolder}/${folder}/${userId}/${uuidv4()}`;
    const cloudFolder = `${this.baseFolder}/${folder}`;

    const paramsToSign: Record<string, string | number> = {
      folder: cloudFolder,
      public_id: publicId,
      timestamp,
    };

    // Signed, so the browser cannot widen it — Cloudinary enforces the list.
    if (limits.formats?.length) {
      paramsToSign.allowed_formats = limits.formats.join(',');
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey: this.apiKey,
      cloudName: this.cloudName,
      folder: cloudFolder,
      publicId,
      // Must be echoed back verbatim in the upload form — it is part of what
      // was signed, so a client that drops or edits it fails the signature.
      allowedFormats: limits.formats?.join(',') ?? undefined,
    };
  }

  /**
   * Ask Cloudinary what was *actually* stored and hold it to the folder's
   * policy, deleting it if it isn't.
   *
   * The signed-upload flow hands the browser a credential and steps out of the
   * way, so the only facts we have about the resulting file are whatever the
   * client chooses to report back — file size and MIME type included. Anything
   * that trusts those (quota accounting, "5 MB max" in the UI, an <img> tag
   * pointed at a 2 GB blob) is trusting the uploader. This is the one call
   * that turns a claimed upload into a verified one, and it returns the
   * authoritative metadata so callers can persist that instead of the claim.
   */
  async verifyUploadedAsset(
    publicId: string,
    folder: UploadFolder,
    resourceType: 'image' | 'video' | 'raw' = 'image',
  ): Promise<{ bytes: number; format: string; secureUrl: string }> {
    const limits = FOLDER_LIMITS[folder];
    if (!limits) {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_FOLDER,
        message: `Unknown folder: ${folder}`,
      });
    }

    let asset: { bytes?: number; format?: string; secure_url?: string };
    try {
      asset = await this.callCloudinary('resource lookup', () =>
        cloudinary.api.resource(publicId, { resource_type: resourceType }),
      );
    } catch (err) {
      // Only a real answer from Cloudinary means the asset isn't there. A
      // transport failure arrives as ServiceUnavailableException and must pass
      // through untouched — reporting "upload it first" for a DNS outage sends
      // the user to re-upload a file that is already stored.
      if (err instanceof ServiceUnavailableException) throw err;
      throw new BadRequestException({
        code: ErrorCode.STORAGE_ASSET_NOT_FOUND,
        message: 'Uploaded file not found — upload it before referencing it',
      });
    }

    const bytes = asset.bytes ?? 0;
    const format = (asset.format ?? '').toLowerCase();

    const tooBig = bytes > limits.maxBytes;
    const wrongFormat =
      Boolean(limits.formats?.length) && !limits.formats!.includes(format);

    if (tooBig || wrongFormat) {
      // Don't leave a rejected file sitting in the account burning storage.
      await this.deleteCloudinaryFile(publicId, resourceType);
      throw new BadRequestException({
        code: tooBig
          ? ErrorCode.STORAGE_FILE_TOO_LARGE
          : ErrorCode.STORAGE_INVALID_MIME,
        message: tooBig
          ? `File exceeds the ${Math.floor(limits.maxBytes / (1024 * 1024))} MB limit for ${folder}`
          : `Allowed types for ${folder}: ${limits.formats!.join(', ')}`,
      });
    }

    return { bytes, format, secureUrl: asset.secure_url ?? '' };
  }

  /** Returns the max file size in bytes for a given folder. */
  getMaxBytes(folder: UploadFolder): number {
    return FOLDER_LIMITS[folder]?.maxBytes ?? 5 * 1024 * 1024;
  }

  /** Delete a Cloudinary asset by public_id. Best-effort: never throws. */
  async deleteCloudinaryFile(
    publicId: string,
    resourceType: 'image' | 'video' | 'raw' = 'image',
    type: 'upload' | 'authenticated' = 'upload',
  ): Promise<void> {
    try {
      await this.callCloudinary('destroy', () =>
        cloudinary.uploader.destroy(publicId, {
          resource_type: resourceType,
          type,
          invalidate: true,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete Cloudinary asset: ${publicId}`, err);
    }
  }

  private cloudinaryConfigured(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  private assertUploadsAvailable(): void {
    const ready =
      this.provider === 'cloudinary'
        ? this.cloudinaryConfigured()
        : this.storageConfigured;
    if (!ready) {
      throw new ServiceUnavailableException({
        code: ErrorCode.STORAGE_PROVIDER_UNAVAILABLE,
        message:
          'File storage is not configured on this server — uploads are unavailable',
      });
    }
  }

  // ── Server-side uploads: long messages, push bundles ─────────────────────

  /**
   * Stores bytes the server already holds. `private` objects (push bundles)
   * are only reachable through getPresignedDownloadUrl; on Cloudinary that
   * means the `authenticated` delivery type.
   */
  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
    opts: { private?: boolean } = {},
  ): Promise<{ key: string; url: string }> {
    this.assertUploadsAvailable();
    if (this.provider === 'cloudinary') {
      const result = await this.uploadBufferToCloudinary(
        buffer,
        `${this.baseFolder}/${key}`,
        'raw',
        opts.private ? 'authenticated' : 'upload',
      );
      return { key: result.public_id, url: result.secure_url };
    }
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

  /** Cloudinary has no dedicated "audio" resource type — audio files upload as 'video'. */
  private cloudinaryResourceType(mimeType: string): 'image' | 'video' | 'raw' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))
      return 'video';
    return 'raw';
  }

  private uploadBufferToCloudinary(
    buffer: Buffer,
    publicId: string,
    resourceType: 'image' | 'video' | 'raw',
    type: 'upload' | 'authenticated' = 'upload',
  ): Promise<UploadApiResponse> {
    // Each attempt gets a fresh stream — a stream that already failed cannot
    // be re-ended, so the retry has to build its own.
    return this.callCloudinary(
      'upload',
      () =>
        new Promise<UploadApiResponse>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { public_id: publicId, resource_type: resourceType, type },
            (err, result) => {
              if (!err && result) return resolve(result);
              if (err instanceof Error) return reject(err);
              // Cloudinary reports transport failures as a plain object, so
              // rejecting with a bare Error would drop the `code` that
              // isTransportError() keys off. Carry it across.
              const wrapped = Object.assign(
                new Error(
                  (err as { message?: string })?.message ??
                    'Cloudinary upload returned no result',
                ),
                err ?? {},
              );
              reject(wrapped);
            },
          );
          stream.on('error', reject);
          stream.end(buffer);
        }),
    );
  }

  async uploadChatAudio(buffer: Buffer, userId: string, mimeType: string) {
    const extensions: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
    };
    const extension = extensions[mimeType];
    if (!extension)
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_MIME,
        message: 'Unsupported audio format',
      });
    const fileName = `${userId}-${uuidv4()}.${extension}`;
    const publicId = `${this.baseFolder}/audio/${userId}/${uuidv4()}`;
    const result = await this.uploadBufferToCloudinary(
      buffer,
      publicId,
      'video',
    );
    return {
      storageKey: result.public_id,
      storageUrl: result.secure_url,
      fileName,
      fileSize: buffer.length,
      mimeType,
    };
  }

  /** Direct server-side upload for chat files (buffered through the API, then pushed to Cloudinary). */
  async uploadChatAttachment(
    buffer: Buffer,
    userId: string,
    fileName: string,
    mimeType: string,
  ) {
    const limits = FOLDER_LIMITS.attachments;
    if (buffer.length > limits.maxBytes) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Chat files must be 100 MB or smaller',
      });
    }
    if (limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_MIME,
        message: 'This file type is not supported',
      });
    }
    const publicId = `${this.baseFolder}/attachments/${userId}/${uuidv4()}`;
    const result = await this.uploadBufferToCloudinary(
      buffer,
      publicId,
      this.cloudinaryResourceType(mimeType),
    );
    return {
      storageKey: result.public_id,
      storageUrl: result.secure_url,
      fileName,
      fileSize: buffer.length,
      mimeType,
    };
  }

  /** Direct server-side upload for a user's own avatar (buffered through the API, then pushed to Cloudinary). */
  async uploadAvatar(buffer: Buffer, userId: string, mimeType: string) {
    const limits = FOLDER_LIMITS.avatars;
    if (buffer.length > limits.maxBytes) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Avatar must be ${Math.round(limits.maxBytes / 1024 / 1024)}MB or smaller`,
      });
    }
    if (limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_MIME,
        message: `Allowed types for avatars: ${limits.mimeTypes.join(', ')}`,
      });
    }
    const publicId = `${this.baseFolder}/avatars/${userId}/${uuidv4()}`;
    const result = await this.uploadBufferToCloudinary(
      buffer,
      publicId,
      'image',
    );
    return {
      storageKey: result.public_id,
      storageUrl: result.secure_url,
      fileSize: buffer.length,
      mimeType,
    };
  }

  /** Direct server-side upload for a user's own profile-level chat background wallpaper. */
  async uploadBackground(buffer: Buffer, userId: string, mimeType: string) {
    const limits = FOLDER_LIMITS.backgrounds;
    if (buffer.length > limits.maxBytes) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Background must be ${Math.round(limits.maxBytes / 1024 / 1024)}MB or smaller`,
      });
    }
    if (limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_MIME,
        message: `Allowed types for backgrounds: ${limits.mimeTypes.join(', ')}`,
      });
    }
    const publicId = `${this.baseFolder}/backgrounds/${userId}/${uuidv4()}`;
    const result = await this.uploadBufferToCloudinary(
      buffer,
      publicId,
      'image',
    );
    return {
      storageKey: result.public_id,
      storageUrl: result.secure_url,
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
    const key = `${prefix}/${uuidv4()}.patch`;
    return this.uploadBuffer(buffer, key, 'text/plain', { private: true });
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 3600,
  ): Promise<string> {
    if (this.provider === 'cloudinary') {
      // A signed, expiring API download link for an `authenticated` raw asset.
      return cloudinary.utils.private_download_url(key, '', {
        resource_type: 'raw',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      });
    }
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
  ): Promise<DirectUploadTicket> {
    this.assertUploadsAvailable();

    const limits = FOLDER_LIMITS[folder];
    if (!limits)
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_FOLDER,
        message: `Unknown folder: ${folder}`,
      });

    if (limits.mimeTypes && !limits.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_INVALID_MIME,
        message: `Allowed types for ${folder}: ${limits.mimeTypes.join(', ')}`,
      });
    }
    if (
      !Number.isFinite(fileSize) ||
      fileSize <= 0 ||
      fileSize > limits.maxBytes
    ) {
      throw new BadRequestException({
        code: ErrorCode.STORAGE_FILE_TOO_LARGE,
        message: `File exceeds max size of ${Math.round(limits.maxBytes / 1024 / 1024)}MB for ${folder}`,
      });
    }

    if (this.provider === 'cloudinary') {
      return this.signDirectCloudinaryUpload(folder, userId, mimeType);
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
    const key = `${folder}/${userId}/${uuidv4()}-${safeName}`;
    const expiresIn = 300; // 5 min to complete the upload

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: mimeType,
      // Both are part of what gets signed, so the check above stops being
      // advisory: the client declared this size and type to obtain the URL,
      // and S3/R2 rejects the PUT if the actual upload doesn't match. Without
      // ContentLength in the signature, `fileSize` is a number the uploader
      // made up and the URL accepts a file of any size.
      ContentLength: fileSize,
    });
    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn,
      signableHeaders: new Set(['content-length', 'content-type']),
    });

    return {
      provider: 'r2',
      method: 'PUT',
      uploadUrl,
      storageKey: key,
      storageUrl: `${this.r2PublicUrl}/${key}`,
      expiresIn,
    };
  }

  /**
   * Cloudinary's equivalent of a presigned PUT: the public_id (and so the
   * owner path segment) is fixed by the signature. Size can't be signed, so
   * verifyDirectUpload checks it once the client reports the upload.
   */
  private signDirectCloudinaryUpload(
    folder: UploadFolder,
    ownerId: string,
    mimeType: string,
  ): DirectUploadTicket {
    const resourceType = this.cloudinaryResourceType(mimeType);
    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `${this.baseFolder}/${folder}/${ownerId}/${uuidv4()}`;
    const signature = cloudinary.utils.api_sign_request(
      { public_id: publicId, timestamp },
      this.apiSecret,
    );
    return {
      provider: 'cloudinary',
      method: 'POST',
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
      fields: {
        api_key: this.apiKey,
        timestamp: String(timestamp),
        signature,
        public_id: publicId,
      },
      storageKey: publicId,
      storageUrl: `https://res.cloudinary.com/${this.cloudName}/${resourceType}/upload/${publicId}`,
      // Cloudinary signatures are valid for one hour.
      expiresIn: 3600,
    };
  }

  /**
   * Checks a direct upload the client reports back (from getPresignedUploadUrl)
   * before it is persisted: the key must be one we minted for this owner and
   * folder, the URL must point at that key in our storage, and on Cloudinary
   * the stored asset must exist and fit the folder's size limit. Returns the
   * authoritative URL and size.
   */
  async verifyDirectUpload(
    folder: UploadFolder,
    ownerId: string,
    storageKey: string,
    storageUrl: string,
    mimeType: string,
  ): Promise<{ storageUrl: string; fileSize: number | null }> {
    const reject = (message: string): never => {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message,
      });
    };

    if (this.provider === 'r2') {
      if (!storageKey.startsWith(`${folder}/${ownerId}/`))
        reject('Invalid storage key');
      if (
        !this.r2PublicUrl ||
        storageUrl !== `${this.r2PublicUrl}/${storageKey}`
      )
        reject('Invalid storage URL');
      return { storageUrl, fileSize: null };
    }

    if (!storageKey.startsWith(`${this.baseFolder}/${folder}/${ownerId}/`))
      reject('Invalid storage key');
    let parsed: URL | null = null;
    try {
      parsed = new URL(storageUrl);
    } catch {
      reject('Invalid storage URL');
    }
    const path = decodeURIComponent(parsed!.pathname).replace(
      /\.[A-Za-z0-9]{1,8}$/,
      '',
    );
    if (
      parsed!.protocol !== 'https:' ||
      parsed!.host !== 'res.cloudinary.com' ||
      !path.startsWith(`/${this.cloudName}/`) ||
      !path.endsWith(`/${storageKey}`)
    )
      reject('Invalid storage URL');

    const asset = await this.verifyUploadedAsset(
      storageKey,
      folder,
      this.cloudinaryResourceType(mimeType),
    );
    return { storageUrl: asset.secureUrl || storageUrl, fileSize: asset.bytes };
  }

  async deleteFile(key: string): Promise<void> {
    if (this.provider === 'cloudinary') {
      await this.deleteCloudinaryFile(key, 'raw', 'authenticated');
      return;
    }
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete R2 file: ${key}`, err);
    }
  }
}
