import { registerAs } from '@nestjs/config';

export default registerAs('cloudinary', () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
  folder: process.env.CLOUDINARY_FOLDER || 'upz',
  /**
   * Where files the browser uploads directly (meeting files, recordings),
   * long chat messages and push bundles go. `cloudinary` for now; `r2` keeps
   * the S3/R2 path (see r2.config.ts) for when object storage is set up.
   * Avatars, backgrounds and chat attachments always go to Cloudinary.
   */
  storageProvider:
    (process.env.STORAGE_PROVIDER || 'cloudinary').toLowerCase() === 'r2'
      ? 'r2'
      : 'cloudinary',
}));
