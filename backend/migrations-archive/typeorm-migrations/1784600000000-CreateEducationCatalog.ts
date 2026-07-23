import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEducationCatalog1784600000000 implements MigrationInterface {
  name = 'CreateEducationCatalog1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE education_channels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        youtube_channel_id varchar(32), channel_name varchar(180) NOT NULL,
        channel_handle varchar(120), channel_url text, avatar_url text, banner_url text,
        description text, default_language varchar(12) NOT NULL DEFAULT 'uz', country varchar(8) DEFAULT 'UZ',
        subjects text[] NOT NULL DEFAULT '{}', exam_types text[] NOT NULL DEFAULT '{}',
        trust_level varchar(16) NOT NULL DEFAULT 'pending' CHECK (trust_level IN ('official','verified','trusted','pending','blocked')),
        is_verified boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
        auto_sync_enabled boolean NOT NULL DEFAULT false, sync_interval_hours integer NOT NULL DEFAULT 24,
        display_order integer NOT NULL DEFAULT 0, last_synced_at timestamptz, created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX education_channels_youtube_uidx ON education_channels(youtube_channel_id) WHERE youtube_channel_id IS NOT NULL;
      CREATE UNIQUE INDEX education_channels_name_pending_uidx ON education_channels(lower(channel_name)) WHERE youtube_channel_id IS NULL;

      CREATE TABLE education_playlists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), youtube_playlist_id varchar(64) NOT NULL UNIQUE,
        channel_id uuid NOT NULL REFERENCES education_channels(id) ON DELETE CASCADE,
        title varchar(240) NOT NULL, description text, subject varchar(64), exam_type varchar(64), level varchar(32),
        language varchar(12) NOT NULL DEFAULT 'uz', thumbnail_url text, is_verified boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0, last_synced_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE education_videos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), youtube_video_id varchar(24) NOT NULL UNIQUE,
        channel_id uuid NOT NULL REFERENCES education_channels(id) ON DELETE RESTRICT,
        playlist_id uuid REFERENCES education_playlists(id) ON DELETE SET NULL,
        title varchar(300) NOT NULL, description text, thumbnail_url text, published_at timestamptz,
        duration_seconds integer NOT NULL DEFAULT 0, language varchar(12) NOT NULL DEFAULT 'uz', subject varchar(64), topic varchar(120),
        exam_type varchar(64), exam_section varchar(64), level varchar(32), tags text[] NOT NULL DEFAULT '{}',
        relevance_score numeric(5,2) NOT NULL DEFAULT 0, quality_score numeric(5,2) NOT NULL DEFAULT 0,
        moderation_status varchar(16) NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected','hidden','unavailable')),
        is_embeddable boolean NOT NULL DEFAULT true, is_short boolean NOT NULL DEFAULT false, is_live boolean NOT NULL DEFAULT false,
        is_available boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0, lesson_outline text,
        last_checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX education_videos_public_idx ON education_videos(subject, published_at DESC) WHERE moderation_status = 'approved' AND is_available AND is_embeddable;
      CREATE INDEX education_videos_search_idx ON education_videos USING gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(topic,'')));

      CREATE TABLE education_saved_videos (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, video_id uuid NOT NULL REFERENCES education_videos(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, video_id)
      );
      CREATE TABLE education_progress (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id uuid NOT NULL REFERENCES education_videos(id) ON DELETE CASCADE,
        watch_progress_percent numeric(5,2) NOT NULL DEFAULT 0, last_position_seconds integer NOT NULL DEFAULT 0,
        completed boolean NOT NULL DEFAULT false, first_opened_at timestamptz NOT NULL DEFAULT now(), last_opened_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz, total_watch_seconds integer NOT NULL DEFAULT 0, quiz_score numeric(5,2),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, video_id)
      );
      CREATE TABLE education_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id uuid NOT NULL REFERENCES education_videos(id) ON DELETE CASCADE, content text NOT NULL,
        timestamp_seconds integer, is_favorite boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX education_notes_owner_idx ON education_notes(user_id, video_id, created_at DESC);
      CREATE TABLE education_video_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id uuid NOT NULL REFERENCES education_videos(id) ON DELETE CASCADE, reason varchar(40) NOT NULL, details text,
        status varchar(16) NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, video_id)
      );

      INSERT INTO education_channels(youtube_channel_id, channel_name, channel_handle, channel_url, subjects, exam_types, trust_level, is_verified, display_order)
      VALUES
        ('UCoEEspqQ6HlLmm2vGlZEKAg','IELTS ZONE','@ieltszone','https://www.youtube.com/channel/UCoEEspqQ6HlLmm2vGlZEKAg',ARRAY['ielts'],ARRAY['IELTS'],'trusted',true,10),
        ('UCVOOP6gzU0X56mA5ApBloQQ','IELTS | MULTILEVEL - Exam preparation',NULL,'https://www.youtube.com/channel/UCVOOP6gzU0X56mA5ApBloQQ',ARRAY['ielts','cefr'],ARRAY['IELTS','Multilevel'],'trusted',true,20),
        ('UCaC5QDCiho4tHY5PCqiI05w','Olimjon SAT-Master',NULL,'https://www.youtube.com/channel/UCaC5QDCiho4tHY5PCqiI05w',ARRAY['sat'],ARRAY['SAT'],'trusted',true,30)
      ON CONFLICT (youtube_channel_id) WHERE youtube_channel_id IS NOT NULL DO UPDATE SET subjects=EXCLUDED.subjects, exam_types=EXCLUDED.exam_types, updated_at=now();

      INSERT INTO education_channels(channel_name, subjects, exam_types, trust_level, is_verified, display_order) VALUES
        ('British Council Uzbekistan',ARRAY['ielts'],ARRAY['IELTS'],'pending',false,40),
        ('Innovative English / IELTS / CEFR',ARRAY['ielts','cefr'],ARRAY['IELTS','CEFR'],'pending',false,50),
        ('Teacher Yusupaliyev',ARRAY['cefr'],ARRAY['CEFR','Multilevel'],'pending',false,60),
        ('Teacher Muzaffar',ARRAY['cefr'],ARRAY['CEFR','Multilevel'],'pending',false,70),
        ('Khan Academy Uzbek',ARRAY['mathematics'],ARRAY[]::text[],'pending',false,80),
        ('Xodiyev Academy',ARRAY['mathematics','sat'],ARRAY['SAT'],'pending',false,90),
        ('Mr Qilichbek | SAT Zone',ARRAY['sat'],ARRAY['SAT'],'pending',false,100),
        ('SATashkent',ARRAY['sat'],ARRAY['SAT'],'pending',false,110)
      ON CONFLICT (lower(channel_name)) WHERE youtube_channel_id IS NULL DO UPDATE SET subjects=EXCLUDED.subjects, exam_types=EXCLUDED.exam_types, updated_at=now();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS education_video_reports, education_notes, education_progress, education_saved_videos, education_videos, education_playlists, education_channels CASCADE');
  }
}
