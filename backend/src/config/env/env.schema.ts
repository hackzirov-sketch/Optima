import { IsEnum, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

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
  DATABASE_POOL_SIZE: number = 20;

  @IsString()
  REDIS_URL: string;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
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

  @IsString()
  @IsOptional()
  ENCRYPTION_KEY?: string;

  @IsString()
  @IsOptional()
  CHAT_ENCRYPTION_KEY?: string;

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

  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;

  @IsString()
  @IsOptional()
  GEMINI_MODEL?: string;

  @IsString()
  @IsOptional()
  GOOGLE_VISION_API_KEY?: string;

  @IsNumber()
  @IsOptional()
  IP_RATE_MAX_ATTEMPTS?: number = 3;

  @IsNumber()
  @IsOptional()
  IP_RATE_WINDOW_HOURS?: number = 24;

  @IsNumber()
  @IsOptional()
  MAX_SESSIONS?: number = 5;
}
