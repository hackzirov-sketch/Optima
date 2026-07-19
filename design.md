# UPZ / Optima — System Design Document

> Workspace chat + video-meeting SaaS. Ushbu hujjat backend (NestJS) va frontend (React+Vite)
> arxitekturasini, ma'lumotlar bazasi sxemasini, Redis ishlatilishini, REST API va WebSocket
> event'larini, autentifikatsiya modelini va fon jarayonlarini to'liq hujjatlashtiradi.
>
> Manba: barcha raqamlar/nomlar bevosita kod va `backend/docker/postgres/init.sql`dan olingan.
> Oxirgi yangilanish konteksti: `setup_production` branch.

---

## 1. Architecture overview

UPZ ikkita asosiy qismdan iborat: **NestJS backend** (`backend/src`) va **React+Vite frontend**
(`frontend/src`). Backend monolit, lekin NestJS modullariga bo'lingan.

### Texnologiyalar

| Qatlam | Texnologiya | Izoh |
|--------|-------------|------|
| Backend framework | NestJS | Modul-based, `backend/src` |
| Frontend | React + Vite + TypeScript | `frontend/src`, nginx orqali serve qilinadi |
| DB | PostgreSQL 16 | **Raw SQL orqali**, ORM emas — pastga qarang |
| DB access | `pg` `Pool` + `DatabaseService` | `backend/src/database/database.service.ts` |
| Cache / ephemeral | Redis (ioredis) | `backend/src/redis/redis.service.ts` |
| Realtime | Socket.IO gateway | `backend/src/modules/gateway/events.gateway.ts` |
| Realtime scale-out | `@socket.io/redis-adapter` | Redis pub/sub, ko'p Node process/replica bo'yicha broadcast |
| Fon jarayonlar | BullMQ (`@nestjs/bullmq`) | 5 ta queue (pastga qarang) |
| Media/fayl | Cloudinary | Avatar, chat attachment, voice |
| Object storage | Cloudflare R2 (S3 API) | Push diff bundle'lari, meeting recording/files |
| Video | WebRTC (mesh, gateway signaling) + STUN/TURN | |
| Email | Mail module | `backend/src/modules/mail` |
| Notifikatsiya kanallari | in_app, email, telegram, sms | |

### ORM emas — raw SQL

`DatabaseService` — TypeORM `DataSource`ning drop-in almashtiruvchisi. Barcha servislar
Postgres bilan **faqat raw SQL** orqali ishlaydi (`this.dataSource.query(sql, params)`).
Metodlari:

- `query<T>(sql, params)` → `T[]` (pool orqali bir martalik so'rov)
- `getClient()` → `PoolClient` (tranzaksiya uchun BEGIN/COMMIT/ROLLBACK)
- `withTransaction(fn)` → `fn`ga transaction-bound `query` beradi; muvaffaqiyatda COMMIT, xatoda ROLLBACK+rethrow

TypeORM runtime'da ishlatilmaydi; `typeorm`/`@nestjs/typeorm` paketlari ataylab o'rnatilmagan.
Sxema `backend/docker/postgres/init.sql` snapshot'idan yaratiladi (2-bo'limga qarang).

### Backend modullari (`backend/src/modules/`)

| Modul | Route prefix(lar)i | Vazifasi |
|-------|--------------------|----------|
| `auth` | `/auth` | Login/register, email verifikatsiya, parol reset, JWT access/refresh, OAuth (Google/GitHub), sessiyalar, rate limiting |
| `users` | `/users` | Profil, sozlamalar, avatar, foydalanuvchi qidiruvi, public profil |
| `workspaces` | `/workspaces`, `/invitations` | Workspace CRUD, a'zolar, rollar, taklifnomalar, tag'lar, egalikni o'tkazish |
| `groups` | `/groups` | Workspace ichidagi jamoalar (teams) va ularning a'zolari |
| `projects` | `/projects` | Loyihalar, kanban ustunlari (columns), loyiha a'zolari va takliflari |
| `tasks` | `/tasks`, `/projects/:id/tasks`, `/workspaces/:id/tasks` | Vazifalar, bog'liqliklar, kuzatuvchilar (watchers), tag'lar, activity trail |
| `pushes` | `/pushes` | Kod review "push"lari (CLI/UI), diff artifact (R2), inline review izohlari, approve/reject |
| `github` | `/github`, `/webhooks` | GitHub App webhook, OAuth akkaunt bog'lash, repozitoriylar |
| `chat` | `/chat`, `/workspaces/:id/chat/...` | Chat xonalari (DM/group/public), xabarlar, reaksiyalar, invite link'lar, OTIMA community, attachment/voice, AI reply |
| `meetings` | `/meetings`, `/workspaces/:id/meetings` | Video uchrashuvlar, ishtirokchilar, yozib olish (recording), fayl ulashish, ICE server config |
| `gateway` | (WebSocket) | Socket.IO realtime gateway — chat, presence, meeting signaling |
| `notifications` | `/notifications` | In-app/email/telegram/sms notifikatsiyalar, preferensiyalar, Telegram bog'lash, reminder'lar |
| `notes` | `/notes` | Eslatmalar (workspace/project/task-scoped yoki global) |
| `analytics` | `/workspaces/:id/analytics`, `/projects/:id/analytics`, `/users/me/analytics` | Workspace/loyiha/developer statistikalar |
| `earnings` | `/workspaces/:id/earnings` | Workspace daromadlarini kuzatish |
| `library` | `/library` | Project Gutenberg kitob o'quvchi proksi (faqat `gutenberg.org`) |
| `storage` | `/storage` | Cloudinary signed upload envelope, R2 fayl o'chirish |
| `moderation` | (controller yo'q — guard + service) | Kontent moderatsiyasi, `banned_content`, `user_violations`, `ViolationService` |
| `mail` | (controller yo'q) | Email yuborish servisi |
| `pushes` (workers) | — | Artifact cleanup fon jarayoni |

Global guard'lar (`app.module.ts` `APP_GUARD` orqali): **`JwtAuthGuard`** (default himoya — `@Public()`
bilan bekor qilinadi) va **`ThrottlerGuard`** (auth'siz umumiy throttling; auth route'lar `@SkipThrottle`).

---

## 2. Database schema

Manba: `backend/docker/postgres/init.sql` (~3153 qator, `pg_dump` snapshot + "MERGE PATCH" qismi).
`backend/migrations-archive/` — bu **eski TypeORM migratsiyalarining arxivi**; runtime'da
ishlatilmaydi, compile qilinmaydi. init.sql yagona haqiqat manbai (source of truth) — arxiv faqat
tarixiy ma'lumot uchun.

Umumiy konvensiyalar: PK'lar `uuid` (`uuid_generate_v4()` yoki `gen_random_uuid()`), timestamp'lar
`timestamptz DEFAULT now()`. Ko'p jadvallar `deleted_at`/`deleted_by` (soft delete) ustunlariga ega.

### 2.0 Enum turlari (`CREATE TYPE ... AS ENUM`)

| Enum | Qiymatlar |
|------|-----------|
| `chat_members_status_enum` | pending, active |
| `chat_rooms_type_enum` | public, private, workspace, project, group, direct |
| `group_members_role_enum` | owner, admin, lead, senior, middle, junior, guest |
| `groups_type_enum` | general, development, design, marketing, management, qa, devops, hr, product |
| `meeting_participant_role_enum` | host, co_host, participant |
| `meeting_recordings_status_enum` | recording, completed, failed, cancelled |
| `meeting_status_enum` | scheduled, live, ended, cancelled |
| `notification_channel_enum` | in_app, email, telegram, sms |
| `notifications_type_enum` | task_assigned, task_updated, task_commented, push_submitted, push_approved, push_rejected, pr_created, pr_reviewed, pr_merged, project_created, project_updated, member_joined, member_role_changed, mention, workspace_invite, task_completed, task_status_changed, project_member_invite, project_member_accepted, project_member_declined, meeting_invite, chat_invite, chat_invite_accepted, chat_invite_declined |
| `project_columns_maps_to_status_enum` | backlog, todo, in_progress, review, testing, done, blocked, cancelled |
| `projects_priority_enum` | critical, high, medium, low |
| `projects_status_enum` | planning, active, on_hold, completed, archived, cancelled |
| `projects_visibility_enum` | public, workspace, private |
| `room_scope_enum` | workspace_only, private, public |
| `task_dependencies_type_enum` | blocks, blocked_by, relates_to, duplicates |
| `task_pushes_status_enum` | pending, uploaded, approved, rejected, expired, cancelled, merged |
| `task_pushes_type_enum` | github_direct, upz_review, draft |
| `tasks_priority_enum` | critical, high, medium, low |
| `tasks_status_enum` | backlog, todo, in_progress, review, testing, done, blocked, cancelled |
| `tasks_type_enum` | feature, bug, improvement, research, design, hotfix |
| `users_language_enum` | uz, ru, en |
| `users_theme_enum` | light, dark, system |
| `workspace_invitations_role_enum` / `workspace_members_role_enum` | owner, admin, lead, senior, middle, junior, guest |
| `workspaces_visibility_enum` | public, private |

### 2.1 Users / Auth

**`users`** — asosiy foydalanuvchi jadvali.
| Ustun | Tur | Cheklovlar |
|-------|-----|-----------|
| id | uuid | PK, DEFAULT uuid_generate_v4() |
| username | varchar(50) | (MERGE PATCH bilan NULL bo'lishi mumkin qilingan) |
| email | varchar(255) | NOT NULL |
| password_hash | varchar | NULL bo'lishi mumkin (social login), `@Exclude` |
| avatar_url | text | |
| language | users_language_enum | NOT NULL DEFAULT 'en' |
| timezone | varchar(50) | NOT NULL DEFAULT 'UTC' |
| theme | users_theme_enum | NOT NULL DEFAULT 'system' |
| is_active | boolean | NOT NULL DEFAULT true |
| is_verified | boolean | NOT NULL DEFAULT false |
| last_seen | timestamptz | |
| first_name / last_name | varchar(50) | NOT NULL |
| phone_number | bigint | |
| providers | text | NOT NULL DEFAULT 'local' |
| needs_password_setup | boolean | NOT NULL DEFAULT false |
| occupation | varchar(255) | |
| public_id | integer | NOT NULL, UNIQUE, 100000–999999 (MERGE PATCH) — immutable |
| created_at/updated_at | timestamptz | NOT NULL DEFAULT now() |
| deleted_at/deleted_by | timestamptz/uuid | soft delete |

Indekslar: `idx_users_email_active` (email) WHERE deleted_at IS NULL AND is_active=true; `UQ_users_public_id` UNIQUE(public_id).
Trigger'lar: `trg_users_updated_at`, `trg_users_otima_memberships` (AFTER INSERT — OTIMA community'ga avto a'zolik),
`trg_assign_random_public_user_id` (BEFORE INSERT), `trg_protect_user_public_id` (BEFORE UPDATE — public_id immutable).

**`refresh_tokens`** — refresh token'lar (SHA-256 hash saqlanadi).
| Ustun | Tur | Cheklovlar |
|-------|-----|-----------|
| id | uuid | PK |
| user_id | uuid | NOT NULL |
| token_hash | varchar(64) | NOT NULL (sha256 hex) |
| device_info | jsonb | |
| expires_at | timestamptz | NOT NULL |
| revoked_at | timestamptz | rotation/logout |
| device_name / ip_address / location / user_agent / provider | | sessiya metadata |
| last_used_at | timestamptz | |

Indekslar: `idx_refresh_tokens_token_hash`, `idx_refresh_tokens_user_id`, `idx_refresh_tokens_active_sessions` (user_id, created_at) WHERE revoked_at IS NULL.

**`user_settings`** — notifikatsiya toggle'lari (`notifications_enabled`, `email_notifications`, `notify_task_assigned`, ...). Register'da avto yaratiladi (auth queue). PK(id), UNIQUE(user_id).

**`user_verifications`** — (legacy) 6-xonali kod jadvali; email verifikatsiya endi Redis'da (3-bo'limga qarang). Index: user_id.

**`user_ip_logs`** — login IP jurnali (user_id, ip_address, user_agent, provider). Index: user_id.

**`user_violations`** — moderatsiya jazolari (type, count, blocked_until, is_permanent, reason). FK user_id→users. Index: user_id.

**`ip_rate_limits`** — DB-backed IP rate limit (ip, action_type, count, window_start, blocked_until). UNIQUE(ip, action_type).

**`audit_logs`** — umumiy audit (workspace_id, actor_id, action, entity_type/id, old_value/new_value jsonb, ip_address inet, user_agent).

**`banned_content`** — moderatsiya pattern'lari (pattern, type, category, severity, is_regex, active). Index: (active, type).

### 2.2 Workspaces / Groups

**`workspaces`** — id, owner_id (NOT NULL), name, slug, description, avatar_url, visibility (workspaces_visibility_enum DEFAULT private), max_members (DEFAULT 10), max_projects (DEFAULT 20), soft delete. Trigger: `trg_workspaces_updated_at`.

**`workspace_members`** — workspace_id, user_id, role (workspace_members_role_enum DEFAULT junior), joined_at.

**`workspace_invitations`** — workspace_id, invited_by, email, role, token varchar(64), expires_at (NOT NULL), accepted_at/declined_at.

**`workspace_github_installations`** — workspace_id, github_installation_id bigint, github_org_name, github_org_avatar_url.

**`groups`** — workspace ichidagi jamoalar: workspace_id, name, slug, type (groups_type_enum DEFAULT general), description, avatar_url, created_by, soft delete.

**`group_members`** — group_id, user_id, role (group_members_role_enum DEFAULT junior), joined_at.

**`tags`** — workspace_id, name varchar(50), color varchar(7) DEFAULT '#6B7280', created_by.

### 2.3 Chat

**`chat_rooms`** — chat xonasi.
| Ustun | Tur | Izoh |
|-------|-----|------|
| id | uuid | PK |
| workspace_id / group_id / project_id | uuid | optional scoping |
| name | varchar(200) | |
| avatar_url / description | | |
| is_archived / is_read_only | boolean | DEFAULT false |
| last_message_id / last_message_at | | trigger bilan yangilanadi |
| created_by | uuid | |
| message_seq | integer | NOT NULL DEFAULT 0 (per-room sequence counter) |
| is_public | boolean | DEFAULT false |
| invite_code | varchar(32) | UNIQUE (`UQ_chat_rooms_invite_code`) |
| type | chat_rooms_type_enum | DEFAULT 'group' |
| scope | room_scope_enum | DEFAULT 'workspace_only' |
| slug | varchar(100) | (MERGE) system room slug |
| is_system | boolean | (MERGE) DEFAULT false — OTIMA rasmiy xonalari |
| membership_locked | boolean | (MERGE) DEFAULT false — majburiy a'zolik |
| posting_mode | varchar(20) | (MERGE) DEFAULT 'members' (yoki 'admins_only') |
| linked_room_id | uuid | (MERGE) FK→chat_rooms (channel ↔ discussion group) |

CHECK `chk_chat_rooms_scope_workspace`: scope='workspace_only' bo'lsa workspace_id NOT NULL.
Unique: `UQ_chat_rooms_system_slug` (lower(slug)) WHERE is_system=true.
Trigger'lar: `trg_chat_rooms_updated_at`, `trg_protect_otima_system_room` (system xona o'chirilishi/immutable maydonlar o'zgarishini bloklaydi).

**`chat_members`** — room_id, user_id, is_muted, muted_until, last_read_at, last_read_message_id, joined_at, left_at, last_read_seq (DEFAULT 0), status (chat_members_status_enum DEFAULT active). MERGE: role varchar(20) DEFAULT 'member', is_banned, banned_until. Trigger `trg_protect_locked_chat_membership` — `membership_locked` xonada a'zolikni o'chirish/tark etishni bloklaydi.

**`chat_messages`** — room_id, sender_id, reply_to_id, content text, content_type varchar(20) DEFAULT 'text', is_edited, deleted_at, is_system, system_metadata jsonb, sequence integer, client_message_id varchar(64) (idempotency), metadata/content_json jsonb, edited_at. MERGE: source_channel_message_id, discussion_root_message_id, is_pinned, view_count.
Indekslar: `IDX_46d...` (reply_to_id); UNIQUE `IDX_4c8...` (room_id, sequence); UNIQUE `IDX_4cd...` (room_id, sender_id, client_message_id) WHERE client_message_id IS NOT NULL (idempotency); `idx_messages_room` (room_id, created_at) WHERE deleted_at IS NULL; UNIQUE `UQ_chat_messages_source_discussion` (source_channel_message_id).
Trigger'lar: `trg_chat_messages_updated_at`, `trg_room_last_message` (AFTER INSERT → chat_rooms.last_message_id/at yangilaydi).

**`chat_reactions`** — message_id, user_id, emoji varchar(10), created_at.

**`chat_room_invites`** — room_id, created_by, code varchar(8), max_uses, uses_count (DEFAULT 0), expires_at, revoked_at. Index `idx_chat_room_invites_code_active` (code) WHERE revoked_at IS NULL; `idx_chat_room_invites_room_id`.

**`message_attachments`** — message_id, uploader_id, file_name varchar(500), file_size bigint, mime_type, storage_key, storage_url, width, height.

### 2.4 Meetings

**`meetings`** — workspace_id, host_id (NOT NULL), title, description, meeting_code varchar(20), status (meeting_status_enum DEFAULT scheduled), start_time (NOT NULL), end_time, max_participants (DEFAULT 100), is_recurring, agenda, scope (room_scope_enum DEFAULT workspace_only). CHECK `chk_meetings_scope_workspace`. Indekslar: host_id, workspace_id. FK'lar CASCADE (host, workspace).

**`meeting_participants`** — meeting_id, user_id, role (meeting_participant_role_enum DEFAULT participant), joined_at, left_at, is_muted, camera_enabled (DEFAULT true), screen_sharing. Index: meeting_id. FK'lar CASCADE.

**`meeting_recordings`** — meeting_id, started_by, status (meeting_recordings_status_enum DEFAULT recording), started_at, stopped_at, duration_seconds, auto_stopped, storage_key/storage_url (R2), file_size bigint. Index: meeting_id; UNIQUE `IDX_meeting_recordings_one_active` (meeting_id) WHERE status='recording' (bir vaqtda faqat 1 aktiv yozuv).

**`meeting_shared_files`** (MERGE) — meeting_id, shared_by, file_name, mime_type, file_size, storage_key (UNIQUE), storage_url. FK'lar CASCADE. Index: (meeting_id, created_at DESC).

### 2.5 Projects / Tasks

**`projects`** — workspace_id (NOT NULL), group_id, repository_id, name, slug, description, cover_url, status (projects_status_enum DEFAULT planning), priority (DEFAULT medium), progress smallint (DEFAULT 0 — trigger bilan hisoblanadi), start_date, deadline, completed_at, created_by, updated_by, visibility (projects_visibility_enum DEFAULT workspace), soft delete. Trigger: `trg_projects_updated_at`.

**`project_columns`** — kanban ustunlari: project_id, name, color varchar(7), position smallint, is_default, maps_to_status (project_columns_maps_to_status_enum).

**`project_members`** — project_id, user_id, role varchar(20) DEFAULT 'member', status varchar(20) DEFAULT 'pending', invited_by, invited_at, joined_at. Index: project_id, user_id.

**`tasks`** — vazifalar (asosiy jadval).
| Ustun | Tur | Izoh |
|-------|-----|------|
| id | uuid | PK |
| workspace_id / project_id | uuid | NOT NULL |
| group_id / column_id / parent_task_id | uuid | optional (parent = subtask) |
| task_number | integer | NOT NULL — trigger bilan avto (per-project) |
| creator_id / assignee_id / reviewer_id | uuid | |
| title | varchar(500) | NOT NULL |
| description | text | |
| type/priority/status | enum'lar | DEFAULT feature/medium/backlog |
| story_points | smallint | |
| estimated_hours/spent_hours | numeric(6,2) | |
| start_date/due_date/completed_at/started_at | | |
| github_pr_number/url | | |
| position | integer | DEFAULT 0 |
| is_accepted/accepted_at/declined_at/decline_reason/completion_note | | qabul qilish oqimi |
| soft delete | | |

Index: `IDX_c86...` (workspace_id, project_id, deleted_at). Trigger'lar: `trg_task_number` (BEFORE INSERT → `assign_task_number()`), `trg_task_progress` (AFTER INSERT/DELETE/UPDATE OF status → `recalculate_project_progress()`), `trg_tasks_updated_at`.

**`task_sequences`** — project_id (PK), last_number — per-project task raqami hisoblagichi (`assign_task_number()` ishlatadi).

**`task_dependencies`** — task_id, depends_on_id, type (task_dependencies_type_enum DEFAULT blocks), created_by. CHECK (task_id <> depends_on_id).

**`task_activities`** — task_id, user_id, type varchar(50), description, metadata jsonb (audit trail).

**`task_tags`** — (task_id, tag_id) junction.

**`task_watchers`** — (task_id, user_id) junction (kuzatuvchilar).

### 2.6 Pushes (code review) / GitHub

**`task_pushes`** — kod push/review artifact'lari: task_id, user_id, repository_id, branch_name, type (task_pushes_type_enum DEFAULT upz_review), status (task_pushes_status_enum DEFAULT pending), commit_message, commit_sha, commits_count, files_changed, added_lines, removed_lines, storage_provider varchar(20) DEFAULT 'r2', storage_url/storage_key (R2 diff bundle), github_commit_sha, github_pr_url, github_pr_number, expires_at (artifact cleanup o'qiydi), reviewed_by, reviewed_at, rejected_reason, cli_version, soft delete. Trigger: `trg_task_pushes_updated_at`.

**`push_review_comments`** — push_id, author_id, parent_id (thread), content, file_path, line_number, line_type varchar(10), is_resolved, resolved_by, resolved_at (inline review izohlari).

**`repositories`** — workspace_id, github_repo_id bigint, name, full_name, description, private, default_branch DEFAULT 'main', clone_url, html_url, require_review DEFAULT true, protected_branches text[] DEFAULT '{main,master,develop}'.

**`github_accounts`** — user_id, github_user_id bigint, username, avatar_url, email, access_token_encrypted, refresh_token_encrypted, token_expires_at, connected_at.

### 2.7 Notes / Library

**`notes`** — workspace_id/project_id/task_id (scope), creator_id, title varchar(200), content text DEFAULT '', soft delete. Indekslar: `IDX_notes_creator`, `IDX_notes_project`, `IDX_notes_task`, `IDX_notes_workspace`.

(Library moduli DB jadval saqlamaydi — tashqi Gutenberg proksi.)

### 2.8 Notifications

**`notifications`** — user_id, actor_id, type (notifications_type_enum), title varchar(255), message, entity_type/entity_id, metadata jsonb, is_read, read_at, action_url. Index: `IDX_af0...` (user_id, is_read).

**`notification_delivery_logs`** — notification_id, user_id, channel (notification_channel_enum), is_success, error_message, external_id, is_read_on_channel. Indekslar: (notification_id), (user_id, created_at DESC).

**`user_notification_prefs`** — kanal-bo'yicha juda batafsil preferensiyalar: telegram_chat_id bigint, phone_verified, va har bir kategoriya uchun sms/telegram/email/in_app toggle'lari (meeting_*, task_*, homework_*, payment_*, security_*, course_*, marketing_*, certificate_*), quiet_start/quiet_end varchar(5). FK user_id→users CASCADE.

### 2.9 Analytics / Earnings

**`developer_daily_stats`** — user_id, project_id, workspace_id, date, commits_count, tasks_completed, pushes_submitted, pushes_approved, added_lines, removed_lines, active_minutes.

**`developer_project_stats`** — user_id, project_id, commits_count, pushes_count, approved_pushes, rejected_pushes, tasks_completed, tasks_in_progress, added_lines/removed_lines bigint, review_score numeric(3,2), review_count.

**`earnings`** — workspace_id, user_id, amount numeric(12,2), currency varchar(3) DEFAULT 'USD', description, date, source_type, source_id. Indekslar: `IDX_earnings_user_id`, `IDX_earnings_workspace_date` (workspace_id, date).

**`public_user_id_registry`** (MERGE) — public_id integer PK (100000–999999 CHECK), user_id UNIQUE, assigned_at. Random 6-xonali public ID reservation.

### 2.10 Trigger funksiyalari (biznes qoidalari)

| Funksiya | Trigger | Vazifasi |
|----------|---------|----------|
| `update_updated_at()` | ko'p jadval BEFORE UPDATE | `updated_at = NOW()` |
| `assign_task_number()` | `tasks` BEFORE INSERT | `task_sequences` orqali per-project task_number beradi |
| `recalculate_project_progress()` | `tasks` AFTER INSERT/DELETE/UPDATE status | Loyiha `progress` foizini qayta hisoblaydi (top-level, non-deleted tasklar bo'yicha) |
| `update_room_last_message()` | `chat_messages` AFTER INSERT | `chat_rooms.last_message_id/at` yangilaydi |
| `ensure_otima_system_memberships()` | `users` AFTER INSERT | Yangi userni OTIMA community channel+group'ga avto qo'shadi |
| `protect_otima_system_room()` | `chat_rooms` BEFORE UPDATE/DELETE | System xonani o'chirish yoki slug/name/is_system/membership_locked o'zgartirishni bloklaydi |
| `protect_locked_chat_membership()` | `chat_members` BEFORE UPDATE/DELETE | `membership_locked` xonada a'zolik majburiy — DELETE/left_at/status≠active bloklanadi |
| `reserve_six_digit_public_id()` | (funksiya) | Bo'sh 6-xonali public_id topib registry'ga yozadi |
| `assign_random_public_user_id()` | `users` BEFORE INSERT | Yangi userga public_id beradi |
| `protect_user_public_id()` | `users` BEFORE UPDATE | public_id immutable |

### 2.11 MERGE PATCH bo'limi

init.sql oxirida idempotent (IF NOT EXISTS / duplicate_object-safe) "MERGE PATCH" bloki — `UPZ-main`dan
 port qilingan xususiyatlar: OTIMA community channel/group (seed + trigger'lar), meeting file sharing
(`meeting_shared_files`), random 6-xonali public user ID'lar. Tafsilotlar: repo root `MERGE_NOTES.md`.

---

## 3. Redis usage

Manba: `backend/src/redis/redis.service.ts`, `backend/src/redis/redis.keys.ts`. `RedisService` **ioredis**
ishlatadi (`REDIS_URL`), `lazyConnect`, `enableAutoPipelining`. Muhim: WRONGPASS yoki Redis o'chganda
ko'p funksiyalar **fail-open** ishlaydi — OAuth code va parol reset token uchun in-memory `memStore` fallback bor.

Barcha kalitlar `upz:` prefiksi bilan (`RedisKeys` da markazlashgan).

| Maqsad | Kalit patterni | TTL | Ishlatuvchi feature |
|--------|----------------|-----|---------------------|
| Access token blacklist | `upz:blacklist:{jti}` | access token qolgan umri (logout'da `exp - now`) | Logout / JWT bekor qilish (fail-open) |
| User sessiya bloki | `upz:user_blocked:{userId}` | beriladigan `ttlSeconds` | Akkaunt o'chirilganda barcha sessiyalarni bloklash |
| OAuth session code | `upz:oauth:{code}` | **60s** | Google/GitHub callback → bir martalik code exchange |
| Parol reset token | `upz:pwd_reset:{token}` | **900s (15m)** | Forgot password |
| Parol reset OTP | `upz:pwd_reset_otp:{resetToken}` | **900s (15m)** | 6-xonali OTP (attempts, MAX 5) |
| Reset confirmed token | `upz:pwd_reset_confirmed:{confirmedToken}` | **600s (10m)** | OTP tasdiqlangach parol o'zgartirishga ruxsat (bir martalik) |
| Rate limit failure counter | `upz:rl:fails:{action}:{ip}` | `windowSeconds` (action bo'yicha) | AuthRateLimitGuard |
| Rate limit block | `upz:rl:block:{action}:{ip}` | `blockSeconds` (action bo'yicha) | AuthRateLimitGuard |
| Account lockout | `upz:account_lock:{userId}` | `lockoutSeconds` | Login failure lockout |
| Account lockout fails | `upz:account_lock:fails:{userId}` | **3600s (1h)** window | Login urinishlarini sanash |
| User cache | `upz:user_cache:{userId}` | **10s** (default) | JWT validatsiya pipeline (blacklist+block+user 1 RTT) |
| Last seen debounce | `upz:last_seen:{userId}` | **30s** (`SET NX EX 30`) | Presence — DB write'ni 30s debounce qiladi |
| Workspace member cache | `upz:ws_member:{workspaceId}:{userId}` | (tasks.service) | Membership tekshiruvi cache |
| Email verification | `upz:email_verify:{token}` | **900s (15m)** | Register email OTP (token bo'yicha, kod bo'yicha emas; MAX 5 attempt) |
| Email verify attempt cooldown | `upz:email_verify:cooldown:{token}` | **90s** | 2+ noto'g'ri urinishdan keyin majburiy kutish |
| Email verify resend cooldown | `upz:email_verify:resend_cd:{userId}` | **60s** | Resend orasidagi kutish |
| Email verify resend count | `upz:email_verify:resend_count:{userId}` | **86400s (1 kun)** | Kunlik resend cap (MAX 5) |
| Telegram read flag | `upz:tg_read:{notifId}` | **48h (48*3600)** | SMS suppression — Telegram o'qilganini kuzatish |
| Reminder dedup (scheduled) | `upz:reminder:sched:{entityId}:{type}` | (scheduler) | Reminder qayta rejalashtirishni oldini olish |
| Reminder dedup (sent) | `upz:reminder:dedup:{userId}:{entityId}:{type}` | **120s** | Job retry'da ikki marta yubormaslik |
| Notif prefs cache | `upz:notif_prefs:{userId}` | **300s (5m)** | Notifikatsiya dispatcher preferensiya cache |
| Quiet hours bypass | `upz:quiet_bypass:{userId}:{notifId}` | (dispatcher) | Quiet hours bypass tracking |

**Pub/Sub — Socket.IO Redis adapter:** `events.gateway.ts` `afterInit`da `@socket.io/redis-adapter`
(`pubClient`+`subClient`, `REDIS_URL`/`REDIS_PASSWORD`) ulanadi — event'lar barcha Node process/replica
bo'yicha broadcast bo'ladi. Redis yo'q bo'lsa gracefully skip.

**BullMQ queue storage:** barcha BullMQ queue'lar (7-bo'lim) ham Redis'ni backend sifatida ishlatadi
(`BullModule.forRootAsync` `app.module.ts`da).

Optimizatsiyalangan pipeline metodlari: `validateTokenPipeline` (blacklist+userBlock+cachedUser 1 RTT),
`checkAndIncrementRateLimit` (ttl+incr+expire 1 RTT).

---

## 4. REST API reference

Umumiy: default barcha route'lar **`JwtAuthGuard`** himoyasida (Bearer access token talab qilinadi),
`@Public()` bilan belgilanganlar ochiq. `@CurrentUser('id')` orqali joriy user olinadi. Quyida
`✅ Public` = auth talab qilinmaydi, aks holda Bearer token kerak.

### 4.1 Auth (`/auth`) — `AuthRateLimitGuard`, `@SkipThrottle`
| Method | Path | Auth | Vazifasi |
|--------|------|------|----------|
| POST | `/auth/set-password` | ✅ Public (token optional) | Social/new akkaunt uchun parol o'rnatish |
| POST | `/auth/register` | ✅ Public | Ro'yxatdan o'tish + verifikatsiya email (rate: 3/1h, block 24h) |
| POST | `/auth/verify-email` | ✅ Public | verifyToken + 6-xonali kod (rate: 10/60s) |
| POST | `/auth/resend-verification` | ✅ Public | Verifikatsiya kodini qayta yuborish (5/1h) |
| POST | `/auth/login` | ✅ Public | Login → access+refresh token+user (5/60s, block 15m) |
| POST | `/auth/forgot-password` | ✅ Public | Parol reset email (5/10m) |
| POST | `/auth/verify-reset-otp` | ✅ Public | OTP tekshirish → confirmedToken (10/10m) |
| POST | `/auth/reset-password` | ✅ Public | confirmedToken bilan parolni o'zgartirish (5/1h) |
| GET | `/auth/google` | ✅ Public | Google OAuth start |
| GET | `/auth/google/callback` | ✅ Public | Google callback → frontend'ga `?code=` bilan redirect |
| GET | `/auth/github` | ✅ Public | GitHub OAuth start |
| GET | `/auth/github/callback` | ✅ Public | GitHub callback → redirect |
| POST | `/auth/exchange-code` | ✅ Public | Bir martalik OAuth code → token'lar (10/60s) |
| POST | `/auth/refresh` | ✅ Public (`JwtRefreshGuard`) | Refresh token → yangi juftlik (rotation; 20/60s) |
| POST | `/auth/logout` | Bearer | Refresh tokenni bekor qilish + access token blacklist |
| GET | `/auth/sessions` | Bearer | Aktiv sessiyalar ro'yxati |
| DELETE | `/auth/sessions/:id` | Bearer | Bitta sessiyani bekor qilish |
| DELETE | `/auth/sessions` | Bearer | Barcha sessiyalarni bekor qilish |

### 4.2 Users (`/users`)
| Method | Path | Auth | Vazifasi |
|--------|------|------|----------|
| GET | `/users/me` | Bearer | Joriy user profili + workspace'lari |
| PATCH | `/users/me` | Bearer | Profilni yangilash |
| PATCH | `/users/me/settings` | Bearer | Sozlamalarni yangilash |
| PATCH | `/users/me/avatar` | Bearer | Avatar URL yangilash (Cloudinary secure_url) |
| GET | `/users/search?q=&limit=` | Bearer | Global user qidiruv (minimal public maydonlar) |
| GET | `/users/profile/:identifier` | ✅ Public | Public profil (username yoki public_id bo'yicha) |
| GET | `/users/:id` | Bearer | User public profil (id bo'yicha) |
| DELETE | `/users/me` | Bearer | Akkauntni soft-delete |

### 4.3 Workspaces (`/workspaces`) + Invitations (`/invitations`)
| Method | Path | Auth | Vazifasi |
|--------|------|------|----------|
| POST | `/workspaces` | Bearer | Yangi workspace yaratish |
| GET | `/workspaces` | Bearer | Joriy user workspace'lari |
| GET | `/workspaces/:slug` | Bearer | Slug bo'yicha workspace |
| PATCH | `/workspaces/:wsId` | Bearer | Sozlamalarni yangilash |
| DELETE | `/workspaces/:wsId` | Bearer | Workspace o'chirish |
| POST | `/workspaces/:wsId/transfer-ownership` | Bearer | Egalikni o'tkazish |
| GET | `/workspaces/:wsId/members` | Bearer | A'zolar |
| PATCH | `/workspaces/:wsId/members/:userId` | Bearer | A'zo rolini o'zgartirish |
| DELETE | `/workspaces/:wsId/members/:userId` | Bearer | A'zoni o'chirish |
| POST | `/workspaces/:wsId/invitations` | Bearer | Yangi a'zo taklif qilish |
| GET | `/workspaces/:wsId/invitations` | Bearer | Kutilayotgan takliflar |
| DELETE | `/workspaces/:wsId/invitations/:id` | Bearer | Taklifni bekor qilish |
| GET | `/workspaces/:wsId/tags` | Bearer | Tag'lar ro'yxati |
| POST | `/workspaces/:wsId/tags` | Bearer | Tag yaratish |
| PATCH | `/workspaces/:wsId/tags/:tagId` | Bearer | Tag yangilash |
| DELETE | `/workspaces/:wsId/tags/:tagId` | Bearer | Tag o'chirish |
| POST | `/invitations/:token/accept` | Bearer | Workspace taklifini qabul qilish |
| POST | `/invitations/:token/decline` | Bearer | Taklifni rad etish |

### 4.4 Groups (`/groups`)
| Method | Path | Vazifasi |
|--------|------|----------|
| POST | `/groups` | Workspace ichida guruh yaratish |
| GET | `/groups/workspace/:workspaceId` | Workspace guruhlari |
| GET | `/groups/:id` | Guruh tafsilotlari |
| PATCH | `/groups/:id` | Guruhni yangilash |
| DELETE | `/groups/:id` | Guruhni o'chirish |
| POST | `/groups/:id/members` | A'zo qo'shish |
| DELETE | `/groups/:id/members/:userId` | A'zoni o'chirish |

### 4.5 Projects (`/projects`)
| Method | Path | Vazifasi |
|--------|------|----------|
| POST | `/projects` | Loyiha yaratish |
| GET | `/projects/workspace/:workspaceId` | Workspace loyihalari |
| GET | `/projects/:id` | Loyiha tafsilotlari |
| PATCH | `/projects/:id` | Loyihani yangilash |
| DELETE | `/projects/:id` | Loyihani o'chirish |
| POST | `/projects/:projectId/columns` | Kanban ustun yaratish |
| PATCH | `/projects/:projectId/columns/:columnId` | Ustunni yangilash |
| DELETE | `/projects/:projectId/columns/:columnId` | Ustunni o'chirish |
| GET | `/projects/:projectId/members` | Loyiha a'zolari |
| POST | `/projects/:projectId/members` | A'zo taklif qilish |
| DELETE | `/projects/:projectId/members/:targetUserId` | A'zoni o'chirish |
| PATCH | `/projects/member-invites/:memberId/respond` | Taklifni qabul/rad qilish |
| GET | `/projects/my-invites` | Mening kutilayotgan takliflarim |

### 4.6 Tasks (`@Controller()` — root prefix'siz)
| Method | Path | Vazifasi |
|--------|------|----------|
| GET | `/projects/:projectId/tasks/:taskId/pushes` | Taskga bog'langan push'lar |
| POST | `/tasks` | Task yaratish |
| GET | `/projects/:projectId/tasks` | Loyiha tasklari |
| GET | `/workspaces/:workspaceId/tasks` | Workspace tasklari |
| GET | `/tasks/:taskId` | Task tafsiloti |
| PATCH | `/tasks/:taskId` | Taskni yangilash |
| DELETE | `/tasks/:taskId` | Taskni soft-delete |
| PATCH | `/tasks/:taskId/move` | Task holatini/ustunini ko'chirish |
| GET | `/tasks/:taskId/watchers` | Kuzatuvchilar |
| POST | `/tasks/:taskId/watch` | Kuzatishga obuna |
| DELETE | `/tasks/:taskId/watch` | Kuzatishni bekor qilish |
| GET | `/tasks/:taskId/activities` | Activity/audit trail |
| GET/POST | `/tasks/:taskId/dependencies` | Bog'liqliklarni olish/qo'shish |
| DELETE | `/tasks/:taskId/dependencies/:dependencyId` | Bog'liqlikni o'chirish |
| GET/POST | `/tasks/:taskId/tags` | Tag'larni olish/biriktirish |
| DELETE | `/tasks/:taskId/tags/:tagId` | Tagni olib tashlash |

### 4.7 Pushes (`/pushes`)
| Method | Path | Vazifasi |
|--------|------|----------|
| GET | `/pushes` | Joriy user push'lari |
| POST | `/pushes` | UPZ review uchun push yuborish (CLI/UI) |
| PATCH | `/pushes/:pushId/link-and-promote` | GitHub PR bilan bog'lash / promote |
| GET | `/pushes/:pushId` | Push tafsiloti |
| GET | `/pushes/:pushId/download` | R2'dan diff artifact presigned URL |
| PATCH | `/pushes/:pushId/approve` | Push tasdiqlash (owner/admin/lead) |
| PATCH | `/pushes/:pushId/reject` | Push rad etish |
| GET/POST | `/pushes/:pushId/comments` | Inline review izohlari |
| PATCH | `/pushes/:pushId/comments/:commentId` | Izohni tahrirlash |
| DELETE | `/pushes/:pushId/comments/:commentId` | Izohni o'chirish |
| PATCH | `/pushes/:pushId/comments/:commentId/resolve` | Izohni resolved deb belgilash |

### 4.8 GitHub (`/github`, `/webhooks`)
| Method | Path | Auth | Vazifasi |
|--------|------|------|----------|
| POST | `/github/webhook` | ✅ Public (signature) | GitHub webhook endpoint |
| POST | `/webhooks/github` | ✅ Public (signature) | GitHub App webhook (spec alias) |

### 4.9 Chat (`@Controller()` — root prefix'siz)
| Method | Path | Vazifasi |
|--------|------|----------|
| GET | `/chat/community` | Majburiy OTIMA community channel + discussion group |
| GET | `/chat/community/:roomId/members` | Community xona a'zolari |
| GET | `/chat/community/:roomId/shared/:kind` | Shared media/files/links/music/voice |
| POST | `/chat/community/posts/:messageId/discussion` | Channel post uchun discussion thread olish/yaratish |
| PATCH | `/chat/community/:roomId/members/:username/role` | A'zoni promote/demote (admin/owner) |
| GET | `/workspaces/:workspaceId/chat/rooms` | Workspace chat xonalari (a'zolik) |
| POST | `/workspaces/:workspaceId/chat/rooms` | Workspace'da xona yaratish |
| POST | `/chat/rooms` | Standalone xona (private/public, workspace'siz) |
| GET | `/chat/rooms/:roomId` | Xona tafsiloti |
| GET | `/chat/rooms/:roomId/members` | Xona a'zolari (qidiruv + paginatsiya) |
| GET | `/chat/rooms/:roomId/shared` | Shared media/files/links/music/voice |
| GET | `/chat/rooms/:roomId/messages` | Xabarlar (sequence yoki offset paginatsiya) |
| POST | `/chat/rooms/:roomId/messages` | Xabar yuborish (REST fallback) |
| DELETE | `/chat/messages/:messageId` | Xabarni soft-delete |
| PATCH | `/chat/messages/:messageId` | Xabarni tahrirlash |
| POST | `/chat/messages/:messageId/reactions` | Reaksiya qo'shish |
| DELETE | `/chat/messages/:messageId/reactions/:emoji` | O'z reaksiyani o'chirish |
| GET | `/workspaces/:workspaceId/chat/public-rooms` | Qo'shilmagan public xonalar |
| POST | `/chat/rooms/:roomId/join` | Public xonaga qo'shilish |
| POST/DELETE | `/chat/rooms/:roomId/invite-code` | (legacy) Yagona invite link olish/bekor qilish |
| POST | `/chat/rooms/:roomId/invites` | Invite link yaratish (limit uses/expiry) |
| GET | `/chat/rooms/:roomId/invites` | Invite linklar ro'yxati (creator/lead+) |
| DELETE | `/chat/rooms/:roomId/invites/:inviteId` | Invite linkni bekor qilish |
| POST | `/chat/join/:code` | Invite kod bilan qo'shilish (`IpRateLimitGuard`) |
| PATCH | `/chat/rooms/:roomId/settings` | Xona sozlamalari (scope/name/description) |
| PATCH | `/chat/rooms/:roomId/mute` | Xona notifikatsiyalarini mute/unmute |
| DELETE | `/chat/rooms/:roomId` | Xonani o'chirish (DM yoki group creator) |
| POST | `/chat/ai` | AI assistant javobi |
| POST | `/chat/rooms/:roomId/attachments/presign` | Chat attachment uchun R2 presigned PUT URL |
| POST | `/chat/rooms/:roomId/attachments/audio` | Ovozli xabar yuklash (Cloudinary) |
| POST | `/chat/rooms/:roomId/attachments/file` | Chat faylni API orqali yuklash (Cloudinary) |
| GET | `/chat/invites/pending` | Barcha kutilayotgan chat takliflari |
| POST | `/chat/rooms/:roomId/invite/accept` | DM/room taklifini qabul qilish |
| POST | `/chat/rooms/:roomId/invite/decline` | Taklifni rad etish |

### 4.10 Meetings (`@Controller()` — root prefix'siz)
| Method | Path | Vazifasi |
|--------|------|----------|
| GET | `/workspaces/:workspaceId/meetings` | Workspace uchrashuvlari |
| POST | `/workspaces/:workspaceId/meetings` | Workspace'da uchrashuv yaratish |
| GET | `/meetings` | User uchrashuvlari |
| POST | `/meetings` | Standalone uchrashuv |
| GET | `/meetings/ice-servers` | WebRTC STUN/TURN konfiguratsiyasi |
| POST | `/meetings/join-by-code` | 8-belgili kod bilan qo'shilish (`IpRateLimitGuard`) |
| GET | `/meetings/:meetingId` | Uchrashuv tafsiloti |
| PATCH | `/meetings/:meetingId` | Uchrashuvni yangilash (host) |
| DELETE | `/meetings/:meetingId` | Uchrashuvni bekor qilish/o'chirish (host) |
| POST | `/meetings/:meetingId/join` | Ishtirokchi sifatida qo'shilish |
| POST | `/meetings/:meetingId/leave` | Uchrashuvni tark etish |
| POST | `/meetings/:meetingId/invite` | A'zolarni taklif qilish |
| GET | `/meetings/:meetingId/files` | Ulashilgan fayllar |
| POST | `/meetings/:meetingId/files/presign` | Fayl yuklash uchun to'g'ridan URL |
| POST | `/meetings/:meetingId/files` | Yuklangan faylni ishtirokchilarga e'lon qilish |
| POST | `/meetings/:meetingId/recordings/start` | Yozib olishni boshlash (max 1 soat, server auto-stop) |
| POST | `/meetings/:meetingId/recordings/stop` | Aktiv yozuvni to'xtatish |
| GET | `/meetings/:meetingId/recordings` | Yozuvlar ro'yxati |
| POST | `/meetings/:meetingId/recordings/:recordingId/presign` | Yozilgan blobni yuklash uchun presigned URL |

### 4.11 Notifications (`/notifications`)
| Method | Path | Vazifasi |
|--------|------|----------|
| GET | `/notifications` | Notifikatsiyalar (paginatsiyalangan obyekt) |
| GET | `/notifications/unread-count` | O'qilmagan soni |
| POST | `/notifications/read-all` | Hammasini o'qilgan deb belgilash |
| PATCH | `/notifications/:id/read` | Bittasini o'qilgan deb belgilash |
| GET/PATCH | `/notifications/preferences` | Preferensiyalarni olish/yangilash |
| POST | `/notifications/telegram/link` | Telegram bot chat_id bog'lash |
| DELETE | `/notifications/telegram/unlink` | Telegramni uzish |

### 4.12 Notes (`/notes`)
| Method | Path | Vazifasi |
|--------|------|----------|
| GET | `/notes` | Scope bo'yicha eslatmalar (taskId/projectId/workspaceId yoki global) |
| POST | `/notes` | Eslatma yaratish |
| GET | `/notes/:noteId` | Eslatmani olish |
| PATCH | `/notes/:noteId` | Yangilash (faqat creator) |
| DELETE | `/notes/:noteId` | O'chirish (faqat creator) |

### 4.13 Analytics, Earnings, Storage, Library, Health
| Method | Path | Auth | Vazifasi |
|--------|------|------|----------|
| GET | `/workspaces/:workspaceId/analytics/overview` | Bearer | Workspace analitika |
| GET | `/projects/:projectId/analytics` | Bearer | Loyiha aggregatlari |
| GET | `/projects/:projectId/analytics/developers` | Bearer | Per-developer statistika |
| GET | `/users/me/analytics` | Bearer | Joriy user analitika snapshot |
| GET | `/workspaces/:workspaceId/earnings/summary` | Bearer | Daromad xulosasi |
| GET | `/workspaces/:workspaceId/earnings` | Bearer | Daromadlar ro'yxati |
| POST | `/workspaces/:workspaceId/earnings` | Bearer | Daromad qo'shish |
| DELETE | `/workspaces/:workspaceId/earnings/:earningId` | Bearer | Daromadni o'chirish |
| POST | `/storage/sign` | Bearer | Cloudinary signed upload envelope (folder, mimeType?) → signature+publicId+maxBytes |
| DELETE | `/storage/file?publicId=` | Bearer | Cloudinary asset o'chirish |
| GET | `/library/read?url=` | Bearer | Gutenberg kitob matni (faqat gutenberg.org, ≤12MB) |
| GET | `/health`, `/healt`, `/` | ✅ Public | Health check |

---

## 5. WebSocket events (`events.gateway.ts`)

Socket.IO gateway, namespace `/`, transport'lar `websocket`+`polling`. Ulanishda `handshake.auth.token`
yoki `Authorization: Bearer` orqali access token verifikatsiya qilinadi (JWT `jwt.accessSecret`); token
yo'q/noto'g'ri bo'lsa `error` emit qilinadi va disconnect. Ulanishdan keyin socket avto join qiladi:
`user:{userId}` (shaxsiy) va har bir `workspace:{wsId}` (membership DB'dan). Redis adapter orqali
cluster-wide broadcast.

### `@SubscribeMessage` handler'lari

| Event | Payload | Vazifasi / Emit |
|-------|---------|-----------------|
| `join_workspace` | `{ workspaceId }` | Membership tekshiradi → `workspace:{id}`ga join. Ack: `workspace_joined` |
| `leave_workspace` | `{ workspaceId }` | Room'dan chiqadi. Ack: `workspace_left` |
| `join_room` | `{ roomId }` | chat_members (left_at IS NULL) tekshiradi → `room:{id}`ga join; boshqalarga `user_joined_room`. Ack: `joined` |
| `leave_room` | `{ roomId }` | Room'dan chiqadi; `user_left_room` broadcast. Ack: `left` |
| `typing` | `{ roomId, typing }` | Room a'zosi bo'lsa boshqalarga `typing` yuboradi |
| `send_message` | `{ roomId, text?, replyToId?, clientMessageId?, attachments[] }` | Violation tekshiradi, `MessageService.sendMessage` orqali DB'ga saqlaydi (idempotency clientMessageId), butun room'ga `new_message` broadcast. Xatoda sender'ga `error`. Ack: `message_sent` |
| `add_reaction` | `{ messageId, roomId, emoji }` | `toggleReaction` → room'ga `reaction_updated` (`action` add/remove) |
| `message_read` | `{ roomId, messageId }` | Room a'zolariga `message_read` (read receipt) |
| `meeting:join` | `{ meetingId }` | `MeetingsService.join` (validatsiya+DB participant), presence room'larga join; joiner'ga `meeting:participants`, boshqalarga `meeting:user-joined`. Xatoda `meeting:error` |
| `meeting:leave` | `{ meetingId }` | `leaveMeeting` — presence tozalaydi, oxirgi socket bo'lsa DB'da `leave` + `meeting:user-left` |
| `meeting:offer` | `{ meetingId, targetUserId, sdp }` | WebRTC offer'ni target user room'iga relay: `meeting:offer` (`fromUserId`) |
| `meeting:answer` | `{ meetingId, targetUserId, sdp }` | WebRTC answer relay: `meeting:answer` |
| `meeting:ice-candidate` | `{ meetingId, targetUserId, candidate }` | ICE candidate relay: `meeting:ice-candidate` |
| `meeting:toggle` | `{ meetingId, kind: audio\|video\|screen, enabled }` | Boshqalarga `meeting:toggled` |
| `call:invite` | `{ meetingId, roomId, targetUserId, kind }` | 1:1 qo'ng'iroq — target'ga `call:incoming` (`fromUserId`) |
| `call:accept` | (DirectCallDto) | Target'ga `call:accepted` |
| `call:decline` | (DirectCallDto) | Target'ga `call:declined` |
| `call:end` | (DirectCallDto) | Target'ga `call:ended` |

### Server-initiated emit'lar

| Event | Trigger |
|-------|---------|
| `user_online` | Ulanish/`workspace:{id}`ga join bo'lganda workspace a'zolariga |
| `online_users` | Ulanishda joiner'ga (workspace-scoped online userlar ro'yxati) |
| `user_offline` | Disconnect'dan ~2s keyin (boshqa aktiv socket yo'q bo'lsa) workspace a'zolariga |
| `user_joined_room` / `user_left_room` | Room join/leave |
| `new_message` | `send_message` muvaffaqiyatida (butun room, sender ham) |
| `reaction_updated` | `add_reaction` |
| `typing`, `message_read` | Mos handler'lardan |
| `meeting:participants`, `meeting:user-joined`, `meeting:user-left` | Meeting presence |
| `meeting:offer/answer/ice-candidate/toggled` | WebRTC signaling relay |
| `meeting:recording:auto-stopped` | Recording auto-stop processor'dan (`broadcastToRoom`) |
| `call:incoming/accepted/declined/ended` | 1:1 qo'ng'iroq signaling |
| `notification` | `sendNotification(userId, payload)` — boshqa servislardan (`user:{id}`) |
| `error` | Auth/violation/reaction xatolari |

Public helper'lar: `sendNotification`, `broadcastToRoom`, `broadcastToWorkspace`, `isUserOnline`, `getOnlineUsers`.

---

## 6. Auth & session model

### JWT access/refresh oqimi
- **Access token**: `JWT_ACCESS_SECRET`, expiry `JWT_ACCESS_EXPIRES = 20m` (`backend/.env`). Payload: `{ sub, email, jti }`.
- **Refresh token**: `JWT_REFRESH_SECRET`, expiry `JWT_REFRESH_EXPIRES = 7d`. DB'da SHA-256 hash sifatida saqlanadi (`refresh_tokens.token_hash`).
- `buildJwtPair` ikkala tokenni parallel imzolaydi; `jti` access token blacklist uchun ishlatiladi.

### Refresh rotation + reuse detection (`token.service.ts`)
`refresh(refreshToken)`:
1. `token_hash` bo'yicha DB'dan topadi; topilmasa → 401 `TOKEN_INVALID`.
2. Agar `revoked_at` mavjud bo'lsa (allaqachon rotate qilingan):
   - `REUSE_GRACE_MS = 20_000` (20s) ichida bo'lsa → benign race (masalan 2 tab) deb hisoblaydi, faqat `TOKEN_INVALID` ("retry with latest token") qaytaradi, sessiyalarni **wipe qilmaydi**.
   - 20s'dan keyin bo'lsa → **haqiqiy reuse/o'g'irlik** deb hisoblaydi: `revokeAllSessions(userId)` + 401 `TOKEN_REVOKED` ("All sessions revoked").
3. `expires_at` o'tgan bo'lsa → 401.
4. **Atomic claim**: `claimRefreshToken(id)` faqat `revoked_at`ni NULL→now flip qila olgan so'rov davom etadi (concurrent race'da faqat bittasi rotate qiladi); yutqazgani grace branch'ga tushadi.
5. Muvaffaqiyatda `generateTokens` — yangi juftlik, eski token metadata (ip/userAgent/device) saqlanib.

`generateTokens` refresh token'ni client'ga qaytarishdan **oldin** `persistRefreshToken`ni kutadi
(millisekundlarda ikkinchi refresh race qilib spurious 401 olishining oldini olish uchun). `passwordHash`
har doim shu choke point'da strip qilinadi (raw SQL row'lar `@Exclude` olmaydi).

### Session limit
`generateTokens` `sessionService.enforceSessionLimit(userId)`ni `buildJwtPair` bilan parallel chaqiradi —
har user uchun aktiv sessiyalar (`refresh_tokens` WHERE revoked_at IS NULL) sonini cheklaydi.

### Logout
`logout(refreshToken, accessToken?)`: refresh tokenni hash bo'yicha revoke qiladi; access token'ni
decode qilib `jti` bo'yicha Redis blacklist'ga qo'yadi (TTL = `exp - now`, min 1s).

### Rate limiting (`AuthRateLimitGuard` + `@AuthRateLimit(...)`)
Har action IP bo'yicha cheklanadi (Redis `upz:rl:fails:*` / `upz:rl:block:*`). Muvaffaqiyatda
`req.clearRateLimit()` (login/verify/refresh/reset kabi) hisoblagichni tozalaydi; register/resend/forgot
(har doim generic 200 qaytaradiganlar) **tozalamaydi**.

| Action | maxAttempts | windowSeconds | blockSeconds |
|--------|-------------|---------------|--------------|
| register | 3 | 3600 (1h) | 86400 (24h) |
| verify-email | 10 | 60 | 1800 |
| resend-verification | 5 | 3600 | 3600 |
| login | 5 | 60 | 900 (15m) |
| forgot-password | 5 | 600 | 600 |
| verify-reset-otp | 10 | 600 | 900 |
| reset-password | 5 | 3600 | 3600 |
| exchange-code | 10 | 60 | 600 |
| refresh | 20 | 60 | 300 |

Qo'shimcha himoya: account lockout (`upz:account_lock:*`, 1h window), email-verify attempt cooldown (90s
after 2 wrong tries, MAX 5), resend cooldown (60s) + kunlik cap (5).

---

## 7. Background jobs / processors (BullMQ)

BullMQ Redis-backed (`BullModule.forRootAsync` `app.module.ts`da). 5 ta queue registratsiya qilingan.

| Queue | Processor | Job(lar) | Trigger | Vazifasi |
|-------|-----------|----------|---------|----------|
| `auth` | `AuthProcessor` | `on-register` | Register muvaffaqiyati | Yangi user uchun default `user_settings` qatorini yaratadi (ON CONFLICT DO NOTHING). (Email verification endi inline — synchronous verifyToken kerak) |
| `chat` | `ChatProcessor` | `update-room-metadata`, `message-side-effects` | Xabar yuborilganda | Room metadata (message_seq, last_message) yangilash (roomId bo'yicha dedup); side-effects (notif/analytics/mentions/search) placeholder |
| `reminders` | `ReminderProcessor` | `meeting_*`, `task_*` (ReminderJobType) | `ReminderSchedulerService` (delayed job'lar) | Meeting eslatmalari (24h/3h/30m/5m — 30m+ CRITICAL → SMS) va task deadline eslatmalari (3d/1d/2h). Dedup `upz:reminder:dedup:*` (120s); notif yaratadi + dispatcher orqali kanallarga yuboradi |
| `artifact-cleanup` | `ArtifactCleanupProcessor` | `sweep-expired-artifacts` | Repeatable cron `0 3 * * *` (har kuni 03:00) | `task_pushes` WHERE status=uploaded AND expires_at<now — R2 obyektni o'chiradi, DB row'ni EXPIRED qiladi (storage pointer'larni tozalab, metadata saqlab). Batch 200 |
| `meeting-recording` | `MeetingRecordingProcessor` | `auto-stop` | Recording boshlanishida delayed job (1h) | 1 soatlik hard cap'ni server-side majburlaydi — `stopRecording(autoStopped)`, `meeting:recording:auto-stopped` broadcast. Qo'lda to'xtatilsa job o'chiriladi |

---

## 8. Known gaps / recent findings

Ushbu sessiyada topilgan/tuzatilgan masalalar:

**Tuzatilgan:**
- Chat plain-room `/members` va `/shared` route'lari yo'q edi — qo'shildi. ✅
- Chat attachment/voice upload'lari local diskka yozib buzuq relative URL berardi — Cloudinary upload'ga o'tkazildi. ✅
- Refresh-token race noto'g'ri "reuse detected" trip qilib force-logout qilardi — grace window kengaytirildi (20s), refresh cooldown qo'shildi. ✅

**Hali ochiq (TODO):**
- Avatar upload endpoint `POST /users/me/avatar/upload` backend'da mavjud emas (404) — frontend `PATCH /users/me/avatar` wiring ishlatishi kerak. ⚠️
- Global search `GET /search` mavjud emas — faqat `GET /users/search` bor, boshqa response shape bilan. ⚠️
- Uchta meeting socket event (`meeting:key`, `meeting:hand`, `meeting:reaction`) backend'da `@SubscribeMessage` handler'siz. ⚠️
- Notifications list response shape mismatch — backend paginatsiyalangan obyekt, frontend bare array kutadi (latent, hali trigger bo'lmagan). ⚠️
