import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  AddNoteDto,
  ListVideosDto,
  MentorChatDto,
  ReportVideoDto,
  VideoProgressDto,
} from './dto/education.dto';
import { ChatAiService } from '../chat/services/ai.service';

const SUBJECTS = [
  {
    id: 'ielts',
    name: 'IELTS',
    description: 'Speaking, Writing, Reading va Listening',
  },
  {
    id: 'cefr',
    name: 'CEFR / Multilevel',
    description: 'A2 dan C1 gacha va yangi format',
  },
  {
    id: 'mathematics',
    name: 'Matematika',
    description: 'Algebra, geometriya va milliy sertifikat',
  },
  { id: 'sat', name: 'SAT', description: 'SAT Math hamda Reading and Writing' },
];

@Injectable()
export class EducationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ai: ChatAiService,
  ) {}

  subjects() {
    return SUBJECTS;
  }

  async home(userId: string) {
    const [channels, latest, continuing, saved] = await Promise.all([
      this.channels(),
      this.videos(userId, { limit: 8 }),
      this.continueLearning(userId),
      this.saved(userId, 6),
    ]);
    return {
      subjects: SUBJECTS,
      trustedChannels: channels.slice(0, 8),
      latest: latest.items,
      continueLearning: continuing,
      saved,
    };
  }

  async dashboard(userId: string) {
    const rows = await this.db.query(
      `SELECT COALESCE(v.subject,'other') AS subject,
      count(*)::int AS opened, count(*) FILTER (WHERE p.completed)::int AS completed,
      round(COALESCE(avg(p.watch_progress_percent),0),1)::float AS progress,
      COALESCE(sum(p.total_watch_seconds),0)::int AS "watchSeconds"
      FROM education_progress p JOIN education_videos v ON v.id=p.video_id
      WHERE p.user_id=$1 GROUP BY v.subject ORDER BY "watchSeconds" DESC`,
      [userId],
    );
    const totals = rows.reduce(
      (
        acc: { opened: number; completed: number; watchSeconds: number },
        row: any,
      ) => ({
        opened: acc.opened + Number(row.opened),
        completed: acc.completed + Number(row.completed),
        watchSeconds: acc.watchSeconds + Number(row.watchSeconds),
      }),
      { opened: 0, completed: 0, watchSeconds: 0 },
    );
    const savedRows = await this.db.query(
      `SELECT count(*)::int AS count FROM education_saved_videos WHERE user_id=$1`,
      [userId],
    );
    return {
      subjects: rows,
      ...totals,
      saved: Number(savedRows[0]?.count || 0),
      completionRate: totals.opened
        ? Math.round((totals.completed / totals.opened) * 100)
        : 0,
    };
  }

  async channels(subject?: string) {
    const args: unknown[] = [];
    const subjectSql = subject
      ? (args.push(subject), ` AND $${args.length} = ANY(subjects)`)
      : '';
    return this.db.query(
      `SELECT id, youtube_channel_id AS "youtubeChannelId", channel_name AS name, channel_handle AS handle,
      channel_url AS "channelUrl", avatar_url AS "avatarUrl", banner_url AS "bannerUrl", description, subjects,
      exam_types AS "examTypes", trust_level AS "trustLevel", last_synced_at AS "lastSyncedAt"
      FROM education_channels WHERE is_verified AND is_active AND trust_level <> 'blocked'${subjectSql}
      ORDER BY display_order, channel_name`,
      args,
    );
  }

  async channel(id: string) {
    const rows = await this.db.query(
      `SELECT id, youtube_channel_id AS "youtubeChannelId", channel_name AS name,
      channel_handle AS handle, channel_url AS "channelUrl", avatar_url AS "avatarUrl", banner_url AS "bannerUrl",
      description, subjects, exam_types AS "examTypes", trust_level AS "trustLevel", last_synced_at AS "lastSyncedAt"
      FROM education_channels WHERE id=$1 AND is_verified AND is_active AND trust_level <> 'blocked'`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Trusted channel topilmadi');
    const playlists = await this.playlists(undefined, id);
    return { ...rows[0], playlists };
  }

  playlists(subject?: string, channelId?: string) {
    const args: unknown[] = [];
    const where = [
      'p.is_verified',
      'p.is_active',
      'c.is_verified',
      "c.trust_level <> 'blocked'",
    ];
    if (subject) {
      args.push(subject);
      where.push(`p.subject=$${args.length}`);
    }
    if (channelId) {
      args.push(channelId);
      where.push(`p.channel_id=$${args.length}`);
    }
    return this.db.query(
      `SELECT p.id, p.youtube_playlist_id AS "youtubePlaylistId", p.channel_id AS "channelId", p.title,
      p.description, p.subject, p.exam_type AS "examType", p.level, p.language, p.thumbnail_url AS "thumbnailUrl",
      c.channel_name AS "channelName" FROM education_playlists p JOIN education_channels c ON c.id=p.channel_id
      WHERE ${where.join(' AND ')} ORDER BY p.display_order, p.title`,
      args,
    );
  }

  // Partial so internal callers (home/video) can pass just a limit; requests
  // arrive as a fully validated ListVideosDto with defaults already applied.
  async videos(userId: string, query: Partial<ListVideosDto>) {
    const page = query.page ?? 1;
    const limit = Math.min(40, query.limit ?? 16);
    const args: unknown[] = [userId];
    const where = [
      "v.moderation_status='approved'",
      'v.is_available',
      'v.is_embeddable',
      'c.is_verified',
      "c.trust_level <> 'blocked'",
      'v.relevance_score >= 45',
    ];
    for (const [key, column] of [
      ['subject', 'v.subject'],
      ['level', 'v.level'],
      ['examType', 'v.exam_type'],
      ['channelId', 'v.channel_id'],
      ['playlistId', 'v.playlist_id'],
    ] as const) {
      if (query[key]) {
        args.push(query[key]);
        where.push(`${column}=$${args.length}`);
      }
    }
    if (query.q?.trim()) {
      args.push(`%${query.q.trim()}%`);
      where.push(
        `(v.title ILIKE $${args.length} OR v.topic ILIKE $${args.length} OR c.channel_name ILIKE $${args.length})`,
      );
    }
    args.push(limit, (page - 1) * limit);
    const items = await this.db.query(
      `SELECT v.id, v.youtube_video_id AS "youtubeVideoId", v.title, v.description,
      v.thumbnail_url AS "thumbnailUrl", v.duration_seconds AS "durationSeconds", v.subject, v.topic, v.exam_type AS "examType",
      v.exam_section AS "examSection", v.level, v.language, v.relevance_score::float AS "relevanceScore",
      v.quality_score::float AS "qualityScore", c.id AS "channelId", c.channel_name AS "channelName", c.avatar_url AS "channelAvatarUrl",
      p.title AS "playlistTitle", COALESCE(ep.watch_progress_percent,0)::float AS progress, COALESCE(ep.completed,false) AS completed,
      (es.user_id IS NOT NULL) AS saved FROM education_videos v JOIN education_channels c ON c.id=v.channel_id
      LEFT JOIN education_playlists p ON p.id=v.playlist_id LEFT JOIN education_progress ep ON ep.video_id=v.id AND ep.user_id=$1
      LEFT JOIN education_saved_videos es ON es.video_id=v.id AND es.user_id=$1 WHERE ${where.join(' AND ')}
      ORDER BY v.display_order, v.quality_score DESC, v.published_at DESC NULLS LAST LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );
    return { items, page, limit, hasMore: items.length === limit };
  }

  async video(id: string, userId: string) {
    const result = await this.videos(userId, { limit: 1 });
    const rows = await this.db.query(
      `SELECT v.id, v.youtube_video_id AS "youtubeVideoId", v.title, v.description,
      v.thumbnail_url AS "thumbnailUrl", v.duration_seconds AS "durationSeconds", v.subject, v.topic, v.exam_type AS "examType",
      v.exam_section AS "examSection", v.level, v.language, v.lesson_outline AS "lessonOutline", c.id AS "channelId",
      c.channel_name AS "channelName", c.trust_level AS "channelTrust", p.title AS "playlistTitle",
      COALESCE(ep.watch_progress_percent,0)::float AS progress, COALESCE(ep.last_position_seconds,0) AS "lastPositionSeconds",
      COALESCE(ep.completed,false) AS completed, (es.user_id IS NOT NULL) AS saved
      FROM education_videos v JOIN education_channels c ON c.id=v.channel_id LEFT JOIN education_playlists p ON p.id=v.playlist_id
      LEFT JOIN education_progress ep ON ep.video_id=v.id AND ep.user_id=$2 LEFT JOIN education_saved_videos es ON es.video_id=v.id AND es.user_id=$2
      WHERE v.id=$1 AND v.moderation_status='approved' AND v.is_available AND v.is_embeddable AND c.is_verified AND c.trust_level<>'blocked'`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('Dars topilmadi');
    return {
      ...rows[0],
      related: (
        await this.videos(userId, { subject: rows[0].subject, limit: 6 })
      ).items
        .filter((item: { id: string }) => item.id !== id)
        .slice(0, 5),
      catalogReady: result.items.length > 0,
    };
  }

  continueLearning(userId: string) {
    return this.db.query(
      `SELECT v.id, v.youtube_video_id AS "youtubeVideoId", v.title, v.thumbnail_url AS "thumbnailUrl",
    c.channel_name AS "channelName", p.watch_progress_percent::float AS progress, p.last_position_seconds AS "lastPositionSeconds"
    FROM education_progress p JOIN education_videos v ON v.id=p.video_id JOIN education_channels c ON c.id=v.channel_id
    WHERE p.user_id=$1 AND NOT p.completed AND v.moderation_status='approved' AND v.is_available ORDER BY p.last_opened_at DESC LIMIT 8`,
      [userId],
    );
  }

  saved(userId: string, limit = 40) {
    return this.db.query(
      `SELECT v.id, v.youtube_video_id AS "youtubeVideoId", v.title, v.thumbnail_url AS "thumbnailUrl",
    v.duration_seconds AS "durationSeconds", v.subject, c.channel_name AS "channelName", true AS saved
    FROM education_saved_videos s JOIN education_videos v ON v.id=s.video_id JOIN education_channels c ON c.id=v.channel_id
    WHERE s.user_id=$1 AND v.moderation_status='approved' AND v.is_available ORDER BY s.created_at DESC LIMIT $2`,
      [userId, limit],
    );
  }

  async save(videoId: string, userId: string) {
    await this.assertVideo(videoId);
    await this.db.query(
      `INSERT INTO education_saved_videos(user_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [userId, videoId],
    );
    return { saved: true };
  }
  async unsave(videoId: string, userId: string) {
    await this.db.query(
      `DELETE FROM education_saved_videos WHERE user_id=$1 AND video_id=$2`,
      [userId, videoId],
    );
    return { saved: false };
  }

  async progress(videoId: string, userId: string, dto: VideoProgressDto) {
    await this.assertVideo(videoId);
    const percent = dto.watchProgressPercent;
    const position = Math.floor(dto.lastPositionSeconds);
    await this.db.query(
      `INSERT INTO education_progress(user_id,video_id,watch_progress_percent,last_position_seconds,total_watch_seconds)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,video_id) DO UPDATE SET watch_progress_percent=GREATEST(education_progress.watch_progress_percent,EXCLUDED.watch_progress_percent),
      last_position_seconds=EXCLUDED.last_position_seconds,total_watch_seconds=education_progress.total_watch_seconds+LEAST(30,GREATEST(0,EXCLUDED.last_position_seconds-education_progress.last_position_seconds)),last_opened_at=now(),updated_at=now()`,
      [userId, videoId, percent, position, position],
    );
    return { progress: percent, lastPositionSeconds: position };
  }

  async complete(videoId: string, userId: string) {
    await this.assertVideo(videoId);
    await this.db.query(
      `INSERT INTO education_progress(user_id,video_id,watch_progress_percent,completed,completed_at)
    VALUES($1,$2,100,true,now()) ON CONFLICT(user_id,video_id) DO UPDATE SET watch_progress_percent=100,completed=true,completed_at=COALESCE(education_progress.completed_at,now()),updated_at=now()`,
      [userId, videoId],
    );
    return { completed: true };
  }

  notes(videoId: string, userId: string) {
    return this.db.query(
      `SELECT id,content,timestamp_seconds AS "timestampSeconds",is_favorite AS "isFavorite",created_at AS "createdAt",updated_at AS "updatedAt" FROM education_notes WHERE video_id=$1 AND user_id=$2 ORDER BY created_at DESC`,
      [videoId, userId],
    );
  }
  async addNote(videoId: string, userId: string, dto: AddNoteDto) {
    await this.assertVideo(videoId);
    const rows = await this.db.query(
      `INSERT INTO education_notes(user_id,video_id,content,timestamp_seconds) VALUES($1,$2,$3,$4)
       RETURNING id,content,timestamp_seconds AS "timestampSeconds",created_at AS "createdAt"`,
      [userId, videoId, dto.content, dto.timestampSeconds ?? null],
    );
    return rows[0];
  }
  async report(videoId: string, userId: string, dto: ReportVideoDto) {
    try {
      await this.db.query(
        `INSERT INTO education_video_reports(user_id,video_id,reason,details) VALUES($1,$2,$3,$4)`,
        [userId, videoId, dto.reason, dto.details || null],
      );
    } catch {
      throw new ConflictException('Bu dars bo‘yicha report yuborilgan');
    }
    return { reported: true };
  }

  async mentor(userId: string, dto: MentorChatDto) {
    const { videoId, message } = dto;
    const video = await this.video(videoId, userId);
    const notes = await this.notes(videoId, userId);
    const context = `Siz OPTIMA Education mentorisiz. Faqat berilgan kontekstga tayangan holda javob bering. Video ichida ko‘rmagan ma’lumotni ko‘rdim demang.\nKontekst manbalari: Video metadata${video.lessonOutline ? ' va Lesson outline' : ''}${notes.length ? ' va foydalanuvchi notes' : ''}.\nDars: ${video.title}\nTavsif: ${(video.description || '').slice(0, 2500)}\nOutline: ${(video.lessonOutline || 'mavjud emas').slice(0, 2000)}\nNotes: ${
      notes
        .slice(0, 5)
        .map((n: { content: string }) => n.content)
        .join(' | ') || 'mavjud emas'
    }\nSavol: ${message}`;
    const reply = await this.ai.generateAiReply(context, [], userId);
    return {
      ...reply,
      contextSources: [
        'Video metadata',
        ...(video.lessonOutline ? ['Lesson outline'] : []),
        ...(notes.length ? ['Lesson notes'] : []),
      ],
    };
  }

  private async assertVideo(id: string) {
    const rows = await this.db.query(
      `SELECT 1 FROM education_videos v JOIN education_channels c ON c.id=v.channel_id WHERE v.id=$1 AND v.moderation_status='approved' AND v.is_available AND v.is_embeddable AND c.is_verified AND c.trust_level<>'blocked'`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Dars topilmadi');
  }
}
