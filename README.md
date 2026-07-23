# UPZ (Optima)

Workspace/jamoaviy hamkorlik platformasi: chat, video-meeting, task/project boshqaruvi (Kanban), GitHub integratsiyasi va bildirishnomalarni birlashtiradi. To'liq arxitektura tavsifi uchun [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)ga qarang.

## Tarkib

```
UPZ/
├── backend/     — NestJS API (TypeScript, raw SQL via pg, Redis, BullMQ, Socket.IO)
├── frontend/    — React 19 + Vite SPA
├── docker-compose.yml           — to'liq production-uslub stack (postgres+redis+coturn+backend+frontend)
├── docker-compose.override.yml  — faqat lokal test uchun (gitignored, avtomatik qo'llanadi)
└── backend/docker-compose.yaml  — backend-scoped dev stack (bind-mount + hot-reload)
```

## Tezkor boshlash — 3 usul

### 1-usul: To'liq Docker (eng oson, production-ga eng yaqin)

Butun stack (frontend + backend + postgres + redis + coturn) bitta buyruq bilan:

```bash
cp .env.example .env   # qiymatlarni to'ldiring (pastga qarang)
docker compose up -d --build
```

- Frontend: http://localhost:8081
- Backend API: http://localhost:8080/api/v1
- Swagger docs: http://localhost:8080/api/v1/docs
- Postgres: `127.0.0.1:5432` (host'dan ham ulanish mumkin, masalan migratsiya/debug uchun)

Ma'lumotlar bazasi **bo'sh** boshlanadi (`backend/docker/postgres/init.sql` orqali schema avtomatik yaratiladi) — birinchi safar ro'yxatdan o'tishingiz kerak bo'ladi.

To'xtatish: `docker compose down` (ma'lumotlarni saqlab qolish uchun `-v` flagini QO'SHMANG).

### 2-usul: Backend uchun dev-stack (hot-reload bilan)

Faqat backend'ni tez-tez o'zgartirib, natijani darhol ko'rish kerak bo'lsa:

```bash
cd backend
cp .env.example .env   # qiymatlarni to'ldiring
docker compose up -d --build
```

Bu `backend/docker-compose.yaml`ni ishga tushiradi: kod `bind-mount` qilinadi, `npm run dev` (`nest start --watch`) ishlaydi — faylni saqlaganingizda avtomatik qayta yuklanadi. Postgres/Redis ham shu bilan birga ko'tariladi (`localhost:5432`, `localhost:6379`).

### 3-usul: To'liq lokal (Docker'siz, eng tez ishlab chiqish uchun)

Ikkita alohida terminalda:

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env   # DATABASE_URL, REDIS_URL va h.k.ni to'ldiring
npm install
npm run dev             # http://localhost:3000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev              # http://localhost:5173, /api ni backend'ga proxy qiladi
```

Bu usulda **postgres/redis/TURN serverni o'zingiz ta'minlashingiz kerak** — masalan `backend/docker-compose.yaml`dan faqat shu ikkitasini ko'tarib (`docker compose up -d postgres redis`), `.env`dagi `DATABASE_URL`/`REDIS_URL`ni shularga mos sozlab qo'yish eng oson yo'l.

## Muhit o'zgaruvchilari (`.env`)

Har uch joyda ham `.env.example` fayllari bor — nusxa oling va to'ldiring:
- `/.env.example` — root docker-compose uchun
- `/backend/.env.example` — backend host-dev yoki `backend/docker-compose.yaml` uchun
- `/frontend/.env.example` (mavjud bo'lsa) — frontend uchun

**Talab qilinadigan muhim qiymatlar:**

| O'zgaruvchi | Tavsif |
|---|---|
| `DATABASE_URL` | Postgres ulanish satri |
| `REDIS_URL` / `REDIS_PASSWORD` | Redis ulanishi |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Kamida 32 belgili tasodifiy satr |
| `ENCRYPTION_KEY`, `CHAT_ENCRYPTION_KEY` | 32 belgili AES kalitlar — `openssl rand -hex 32` bilan generatsiya qiling |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Meeting (video-qo'ng'iroq) uchun TURN server — pastga qarang |
| `FRONTEND_URL` | CORS uchun — frontend qaysi manzilda ishlasa, shu yerga yoziladi |

**Muhim**: `CHAT_ENCRYPTION_KEY` o'zgartirilsa, **eski xabarlar butunlay o'qib bo'lmas holga keladi** (AES-GCM shifrlashning tabiati shunday — bu xatolik emas, tuzatib bo'lmaydi). Kaliti generatsiya qilib, uni doim saqlab, hech qachon yo'qotmang.

## Video-meeting (TURN server)

Meeting funksiyasi ishlashi uchun WebRTC TURN server kerak — shunisiz faqat bir xil lokal tarmoqdagi foydalanuvchilar bir-birini ko'radi, turli tarmoq/NAT ortidagilar uchun ulanish sinab ko'rilmaydi.

```bash
docker compose up -d coturn
```

- **Bir xil kompyuter/tarmoqda test qilish**: `.env`dagi `TURN_PUBLIC_HOST=localhost` yetarli (standart qiymat).
- **Turli tarmoqlar orasida ishlashi uchun** (masalan uydan va ofisdan): bu server **haqiqiy public IP**ga ega bo'lishi va UDP `3478` + `49160-49200` portlari forward qilingan bo'lishi kerak; `TURN_PUBLIC_HOST`ga shu public manzilni yozing.

## Ma'lumotlar bazasi — migratsiyalar YO'Q, `init.sql` bor

Bu loyiha TypeORM'dan butunlay voz kechgan (tafsilotlar uchun [SYSTEM_DESIGN.md §2.1](SYSTEM_DESIGN.md)ga qarang). Schema versiyalangan migratsiyalar orqali emas, **bitta [`backend/docker/postgres/init.sql`](backend/docker/postgres/init.sql)** fayli orqali boshqariladi:

- **Yangi/bo'sh Postgres** — `init.sql` `docker-entrypoint-initdb.d` orqali avtomatik ishga tushadi (docker-compose ishlatilganda). Qo'lda ishga tushirish uchun: `psql "$DATABASE_URL" -f backend/docker/postgres/init.sql`.
- **Schema o'zgarishi kerak bo'lsa** — `init.sql`ni qo'lda tahrirlang (yangi `ALTER TABLE`/`CREATE TABLE` qo'shing). Bu fayl **idempotent emas** — allaqachon mavjud bazaga qayta ishga tushirish xato beradi, faqat yangi bazalar uchun mo'ljallangan.
- Mavjud (production) bazani yangilash kerak bo'lsa, tegishli `ALTER`/`CREATE` buyruqlarini alohida qo'lda bajaring va `init.sql`ni ham yangilab qo'ying (kelajakdagi fresh-setup'lar bilan sinxron bo'lishi uchun).

## Backend arxitekturasi (qisqacha)

- **Ma'lumotlar bazasiga murojaat**: TypeORM emas, plain `pg.Pool` — [`DatabaseService`](backend/src/database/database.service.ts) orqali (`this.dataSource.query(sql, params)`, tranzaksiyalar uchun `this.dataSource.withTransaction(async (query) => {...})`).
- **Modul strukturasi** (bosqichma-bosqich o'tkazilmoqda — holat uchun [SYSTEM_DESIGN.md §2.2](SYSTEM_DESIGN.md)ga qarang):
  ```
  modules/<nom>/
  ├── controllers/     — HTTP endpointlar
  ├── services/        — biznes-logika
  ├── repositories/     — SQL so'rovlar shu yerda
  ├── schemas/          — Zod validatsiya sxemalari (createZodDto)
  ├── guards/, strategies/  — auth-specific modullarda
  └── <nom>.module.ts
  ```
  Hozircha `auth`, `users`, `workspaces`, `groups` shu strukturaga to'liq o'tkazilgan; qolganlari eski (`dto/` + class-validator) strukturada — ikkalasi ham parallel ishlaydi (`DualValidationPipe`).
- **Validatsiya**: yangi modullarda [Zod](https://zod.dev) (`nestjs-zod`), eski modullarda `class-validator` — ikkalasi ham global `DualValidationPipe` orqali qo'llab-quvvatlanadi.

## Foydali buyruqlar

```bash
# Backend
cd backend
npm run dev          # hot-reload dev server
npm run build         # production build
npm run typecheck     # tsc --noEmit (yoki tsc -b)
npm run lint           # eslint --fix
npm run test            # jest

# Frontend
cd frontend
npm run dev            # Vite dev server (5173)
npm run build           # production build
npm run typecheck        # tsc -b
```

## Xizmatlar va portlar (to'liq docker-compose)

| Xizmat | Port (host) | Izoh |
|---|---|---|
| frontend (nginx) | 8081 | statik build + `/api`, `/socket.io`, `/uploads` proxy |
| backend | 8080 | REST API + Socket.IO |
| postgres | 5432 | debug/migratsiya uchun host'dan ham ochiq |
| redis | — | faqat ichki tarmoq |
| coturn | 3478 (UDP/TCP), 49160-49200 (UDP) | host tarmog'ida (`network_mode: host`) |
