import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The education module previously took `@Body() body: Record<string, unknown>`
 * and coerced fields with `String(body.x || '')` at the point of use, which
 * meant a nested object arrived as the literal `"[object Object]"` and every
 * length/shape rule lived (or didn't) in whichever line happened to read the
 * field. These mirror the Zod DTOs the rest of the codebase uses, so bad input
 * is rejected at the edge with the standard validation error shape.
 */

export const videoProgressSchema = z.object({
  watchProgressPercent: z.coerce.number().min(0).max(100),
  lastPositionSeconds: z.coerce.number().min(0).max(86_400).default(0),
});
export class VideoProgressDto extends createZodDto(videoProgressSchema) {}

export const addNoteSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  timestampSeconds: z.coerce.number().min(0).max(86_400).nullish(),
});
export class AddNoteDto extends createZodDto(addNoteSchema) {}

export const REPORT_REASONS = [
  'irrelevant',
  'wrong_category',
  'unavailable',
  'low_quality',
  'advertising',
  'wrong_language',
  'duplicate',
  'other',
] as const;

export const reportVideoSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1_000).optional(),
});
export class ReportVideoDto extends createZodDto(reportVideoSchema) {}

export const mentorChatSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  videoId: z.string().uuid(),
});
export class MentorChatDto extends createZodDto(mentorChatSchema) {}

export const listVideosSchema = z.object({
  q: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(100).optional(),
  examType: z.string().trim().max(100).optional(),
  level: z.string().trim().max(50).optional(),
  language: z.string().trim().max(10).optional(),
  playlistId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export class ListVideosDto extends createZodDto(listVideosSchema) {}

// ── Admin ──────────────────────────────────────────────────────────────────

export const resolveChannelSchema = z.object({
  source: z.string().trim().min(1).max(500),
});
export class ResolveChannelDto extends createZodDto(resolveChannelSchema) {}

export const addPlaylistSchema = z
  .object({
    channelId: z.string().uuid(),
    youtubePlaylistId: z.string().trim().max(500).optional(),
    source: z.string().trim().max(500).optional(),
    subject: z.string().trim().max(100).optional(),
    examType: z.string().trim().max(100).optional(),
    level: z.string().trim().max(50).optional(),
    language: z.string().trim().max(10).default('uz'),
  })
  .refine((v) => Boolean(v.youtubePlaylistId || v.source), {
    message: 'youtubePlaylistId yoki source kiritilishi kerak',
    path: ['youtubePlaylistId'],
  });
export class AddPlaylistDto extends createZodDto(addPlaylistSchema) {}

export const moderateVideoSchema = z.object({
  status: z.enum(['approved', 'rejected', 'hidden', 'pending']),
});
export class ModerateVideoDto extends createZodDto(moderateVideoSchema) {}
