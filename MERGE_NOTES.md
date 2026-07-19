# Merge notes — UPZ-main + UPZ-setup_production

This repo is the result of merging two diverged branches of the same
project:

- **`UPZ-setup_production`** — the base. A production-hardening branch that
  removed TypeORM in favor of raw SQL (`DatabaseService` over a plain `pg`
  pool), restructured `auth`/`users`/`workspaces`/`groups` into
  `controllers/services/repositories/schemas` with Zod validation, added
  production Docker/nginx config, and replaced 30+ versioned migrations with
  a single `backend/docker/postgres/init.sql` schema snapshot. See
  `SYSTEM_DESIGN.md` for the original rationale.
- **`UPZ-main`** — newer feature work that was never ported to the
  production branch: the OTIMA community channel/group, meeting file
  sharing, the Library (Gutenberg reader) page, the public-profile page,
  random 6-digit public user IDs, and a fuller AI assistant (Gemini + Groq
  fallback with search grounding).

The merge kept `setup_production`'s architecture as the foundation and
ported every `main`-only feature onto it. Below is what changed and what
still needs your attention.

## What was ported

- **Library module** (`backend/src/modules/library`, `/library` route,
  `frontend/src/pages/LibraryPage.tsx`) — copied as-is; it has no database
  dependency, so nothing else needed to change. Wired into `app.module.ts`,
  `App.tsx`, and the sidebar nav in `AppShell.tsx`.
- **OTIMA community channel/group** — `community.service.ts` was rewritten
  from `@InjectDataSource() DataSource` (TypeORM) to the new
  `DatabaseService` (the method signatures are identical — `query()` and
  `withTransaction()` — so only the injected type changed, not the SQL).
  Re-added to `chat.module.ts` and the five `/chat/community*` routes in
  `chat.controller.ts`. The columns and triggers it depends on
  (`chat_rooms.slug/is_system/membership_locked/posting_mode/linked_room_id`,
  `chat_members.role/is_banned/banned_until`,
  `chat_messages.source_channel_message_id/discussion_root_message_id/is_pinned/view_count`,
  plus the seed rows and immutability triggers) were **not** in
  `init.sql` and have been appended to it as an idempotent patch — search
  `init.sql` for `MERGE PATCH` to see exactly what was added.
- **Meeting file sharing** — `shareFile`/`listSharedFiles`/`presignSharedFile`
  ported into `meetings.service.ts` (same `DatabaseService` swap), routes
  restored in `meetings.controller.ts`. The `meeting_shared_files` table
  didn't exist in `init.sql` either and was added in the same patch.
- **Public profile page** — `frontend/src/pages/PublicProfilePage.tsx`
  copied over; added the backend route it needs
  (`GET /users/profile/:identifier`, public, looks up by `@username` or
  numeric public ID) plus `usersService.findPublic()`.
- **Random 6-digit public user IDs** — `users.public_id` (integer) +
  `public_user_id_registry` table + the assignment/immutability triggers
  were added to `init.sql`. `User` entity, `USER_COLUMNS_SQL`, and
  `PublicUserDto` now include `publicId`. Frontend `User` type got
  `publicId?: string` and `username` was changed back to `string | null`
  (main made it nullable when public IDs were introduced) — **run the
  frontend typecheck**, this may surface a few spots that assumed
  `username` was always a string.
- **Fuller AI assistant** — `ai.service.ts` replaced outright with main's
  version (Gemini for "needs fresh facts" queries with Google Search
  grounding, Groq as the fast path otherwise, each falls back to the
  other). It's self-contained (only needs `@google/generative-ai` and
  `openai`, both already in `package.json`). Restored `AiRequestDto`
  validation + `@Throttle` on `POST /chat/ai` (setup_production's version
  had dropped both). `GEMINI_API_KEY`/`GEMINI_MODEL`/`GROQ_API_KEY`/`GROQ_MODEL`
  were added back to `docker-compose.yml`, `.env.example`, and
  `backend/.env.example` (setup_production's docker-compose had dropped
  these when the DTO/feature was simplified).
- **API client / types** — added `api.users.publicProfile`,
  `api.chat.community` + `communityDiscussion`, `api.meetings.files` +
  `shareFile`, `api.library.read`, and the `MeetingFile` type.

## Frontend: fully merged (update — see below)

`ChatPage.tsx`, `MeetingsPage.tsx`, `MeetingRoomPage.tsx`,
`DashboardPage.tsx`, `ProfilePage.tsx`, `App.tsx`, `AppShell.tsx`,
`components/ui.tsx`, `lib/auth.tsx`, `lib/socket.ts`, and `styles.css`
were replaced with main's fuller versions (main was consistently the
richer file everywhere this was checked — Community UI, direct
audio/video calls, meeting file sharing UI, message search, room
context menu, AI assistant panel, theme toggle, dashboard delete
buttons, session-tab profile UI, proactive token refresh). Backend
routes and API client methods were extended to match what these pages
call:

- **Room creation**: main's `visibility` field was renamed to
  `scope` (setup_production's `RoomScope`) — `members_only` maps to
  `workspace_only`.
- **`targetPublicId` direct-message lookup** — `room.service.ts`
  `createRoom` didn't resolve a public ID to a user ID; ported that
  resolution from main.
- **Direct (1:1) call signaling** — `events.gateway.ts` had no
  `call:invite/accept/decline/end` handlers at all; ported all four
  from main (needed for the audio/video call overlay in `ChatPage`).
- **Chat file upload** — `POST /chat/rooms/:roomId/attachments/file`
  (direct server-side upload, used by `api.chat.uploadFile`) and
  `storageService.uploadChatAttachment` didn't exist; ported both.
- **Community moderation on send** — `message.service.ts`'s
  `sendMessage` didn't check `chat_members.is_banned/banned_until` or
  `chat_rooms.posting_mode = admins_only` (the OTIMA channel is meant
  to be posted to by one admin only, identified by
  `public_id = '777777'` per main's `LockCommunityPublisher`
  migration) — ported both checks, and extended
  `assertRoomMemberWithUser`/`CHAT_MEMBER_COLUMNS_SQL` to select
  `role`/`is_banned`/`banned_until` and the user's `public_id`.
- **`CHAT_MESSAGE_COLUMNS_SQL`** — added
  `source_channel_message_id`/`discussion_root_message_id`/`is_pinned`/`view_count`
  (discussion-thread linking for channel posts).
- **AI assistant** — `ai.service.ts` replaced with main's version
  (Gemini + Groq fallback, search grounding); `AiRequestDto` validation
  and `@Throttle` restored on `POST /chat/ai`.
- **Entities** — `ChatRoom`/`ChatMember`/`ChatMessage` (backend) and
  `ChatRoom`/`ChatMessage`/`User`/`MeetingFile` (frontend `types.ts`)
  extended with the fields above.
- **`vite.config.ts` was intentionally kept as setup_production's** —
  it reads the API proxy target from `VITE_API_URL` instead of main's
  hardcoded `api.honeymedia.uz`, which is the better choice for a
  fresh deployment.
- **`AuthPage.tsx` was intentionally kept as setup_production's** — it
  has a demo-login feature (`.demo-access`) that main doesn't have;
  only cosmetic copy differs otherwise. Its CSS was preserved when
  `styles.css` was replaced.

**Not run or type-checked** — I don't have a Postgres/Redis instance or
`npm install` in this environment, so none of this was compiled or
tested end-to-end. Before deploying: run `npm run typecheck` in both
`backend` and `frontend`, and `npm run build` in `backend` — the most
likely remaining issues are TypeScript strictness on the now-nullable
`username`, and any raw-SQL column typo in the ported queries.

## Schema decisions worth double-checking

- `chat_rooms.type` (old enum: public/private/workspace/project/group/
  direct) was **kept** — setup_production's `init.sql` already had it
  alongside the newer `scope` (`RoomScope`) column, even though a later
  `main` migration had dropped `type` entirely in favor of deriving room
  kind from foreign keys. I did not remove `type` since setup_production's
  own code and the community feature's `CASE WHEN slug = 'otima-community'
  THEN 'channel' ELSE r.type::text END` both still read it.
- `users.public_id` here is main's **random 6-digit** scheme (not the
  earlier sequential 100000001+ scheme main also had — that one was
  superseded by main itself before this merge).

## TypeORM migrations archive

`backend/migrations-archive/` holds every old TypeORM migration file (both
from `backend/src/database/migrations/` and the root-level
`*-migrations.ts` files) plus `data-source.ts`, moved out of `src/` so
`tsc`/`nest build` never touches them — `typeorm`/`@nestjs/typeorm` are
intentionally not in `package.json` (setup_production's decision, see
`SYSTEM_DESIGN.md` §2.1). They're kept only as historical reference; the
cumulative schema they produce (plus everything ported in this merge) is
what `init.sql` now contains directly.

## One more thing

`.env` at the repo root (copied as-is from setup_production) contains what
looks like a real `GEMINI_API_KEY` value, not a placeholder. Worth
rotating that key and confirming `.env` was never meant to be committed —
`.gitignore` now ignores it going forward, but check your git history.
