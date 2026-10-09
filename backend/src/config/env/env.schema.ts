import { DEFAULT_POOL_SIZE } from '../database.config';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  NotEquals,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api/v1';

  @IsUrl({ require_tld: false })
  @IsOptional()
  FRONTEND_URL: string;

  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  DATABASE_POOL_SIZE: number = DEFAULT_POOL_SIZE;

  @IsString()
  REDIS_URL: string;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters long',
  })
  @NotEquals('your-32-char-secret', {
    message: 'JWT_ACCESS_SECRET is still the .env.example placeholder',
  })
  @NotEquals('change-this-to-strong-32-char-secret', {
    message: 'JWT_ACCESS_SECRET is still a placeholder value',
  })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must be at least 32 characters long',
  })
  @NotEquals('your-32-char-secret', {
    message: 'JWT_REFRESH_SECRET is still the .env.example placeholder',
  })
  @NotEquals('change-this-to-strong-32-char-refresh-secret', {
    message: 'JWT_REFRESH_SECRET is still a placeholder value',
  })
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES: string = '20m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES: string = '7d';

  @IsString()
  @IsOptional()
  GITHUB_APP_ID?: string;

  @IsString()
  @IsOptional()
  GITHUB_APP_PRIVATE_KEY?: string;

  @IsString()
  @IsOptional()
  GITHUB_APP_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  R2_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  R2_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  R2_SECRET_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  R2_BUCKET_NAME?: string;

  @IsString()
  @IsOptional()
  R2_PUBLIC_URL?: string;

  /**
   * Held to the same bar as the JWT secrets: both derive an AES-256 key
   * through scrypt, and scrypt stretches a weak input without adding entropy
   * to it — `ENCRYPTION_KEY=secret` yields a perfectly valid 32-byte key that
   * is still worth about six characters of guessing. What they protect is
   * stored GitHub OAuth tokens and, for the chat key, message bodies at rest.
   */
  @IsString()
  @IsOptional()
  @MinLength(32, {
    message: 'ENCRYPTION_KEY must be at least 32 characters long',
  })
  @NotEquals('change-this-to-strong-32-char-secret', {
    message: 'ENCRYPTION_KEY is still a placeholder value',
  })
  ENCRYPTION_KEY?: string;

  @IsString()
  @IsOptional()
  @MinLength(32, {
    message: 'CHAT_ENCRYPTION_KEY must be at least 32 characters long',
  })
  @NotEquals('change-this-to-strong-32-char-secret', {
    message: 'CHAT_ENCRYPTION_KEY is still a placeholder value',
  })
  CHAT_ENCRYPTION_KEY?: string;

  /**
   * Shared with the TURN server (coturn `use-auth-secret`). When set, each
   * client is issued its own expiring credential instead of everyone sharing
   * one static username and password — see MeetingsService.getIceServers.
   */
  @IsString()
  @IsOptional()
  @MinLength(32, {
    message: 'TURN_SECRET must be at least 32 characters long',
  })
  TURN_SECRET?: string;

  @IsNumber()
  @IsOptional()
  TURN_TTL_SECONDS?: number = 3600;

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsNumber()
  @IsOptional()
  SMTP_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsNumber()
  @IsOptional()
  PUSH_ARTIFACT_TTL_DAYS?: number;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CALLBACK_URL?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_KEY?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_SECRET?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_FOLDER?: string;

  @IsIn(['cloudinary', 'r2'])
  @IsOptional()
  STORAGE_PROVIDER?: string;

  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;

  @IsString()
  @IsOptional()
  GEMINI_MODEL?: string;

  @IsString()
  @IsOptional()
  GROQ_API_KEY?: string;

  @IsString()
  @IsOptional()
  GROQ_MODEL?: string;

  @IsString()
  @IsOptional()
  YOUTUBE_API_KEY?: string;

  @IsString()
  @IsOptional()
  GOOGLE_VISION_API_KEY?: string;

  /**
   * Join-by-code guard (see moderation.config.ts).
   *
   * These defaults were 3 attempts per 24 hours, and they are what the app
   * actually ran on — the validated env wins over moderation.config's own
   * fallbacks, so the third meeting anyone opened from one IP locked that IP
   * out for a day. That is a denial of service against ordinary use with a
   * brute-force guard's name on it.
   */
  @IsNumber()
  @IsOptional()
  IP_RATE_MAX_ATTEMPTS?: number = 40;

  @IsNumber()
  @IsOptional()
  IP_RATE_WINDOW_SECONDS?: number = 60;

  /** Nothing this guard issues may exceed this, in seconds. */
  @IsNumber()
  @IsOptional()
  IP_RATE_MAX_BLOCK_SECONDS?: number = 90;

  @IsNumber()
  @IsOptional()
  MAX_SESSIONS?: number = 5;
}
