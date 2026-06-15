import { registerAs } from '@nestjs/config';

export default registerAs('moderation', () => ({
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY || '',
  // Block durations in minutes per violation count (index = count-1)
  // count=1 → 15 min, count=2 → 30 min, count≥3 → permanent
  blockDurationsMinutes: [15, 30],
  permanentBlockThreshold: 3,
  // IP rate limit: max registrations per window
  ipMaxAttempts: parseInt(process.env.IP_RATE_MAX_ATTEMPTS || '3', 10),
  ipWindowHours: parseInt(process.env.IP_RATE_WINDOW_HOURS || '24', 10),
}));
