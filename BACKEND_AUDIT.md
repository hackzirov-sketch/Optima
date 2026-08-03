# Backend Audit — 2026-08-03

To'liq tekshiruv: 60 ta jadval (`optima@localhost`), 20 ta modul, 20 ta kontroller, ~230 ta route. Har bir topilma
**tekshirilgan** — taxmin emas, live schema va koddan olingan.

**Status ustuni:** ⬜ hal qilinmagan · 🟩 tuzatildi · ⬛ ataylab shunday (fix kerak emas)

---

## 0. Xulosa

| Daraja    | Soni | Hal qilindi | Nima                                              |
|-----------|------|-------------|---------------------------------------------------|
| 🔴 Kritik | 4    | **4**       | Ma'lumot buziladi yoki funksiya umuman ishlamaydi |
| 🟠 Muhim  | 7    | **7**       | Yuklamada sinadi yoki noto'g'ri holat qoldiradi   |
| 🟡 O'rta  | 6    | **2**       | Texnik qarz, hozircha zarar bermaydi              |
| 🟢 Yaxshi | 5    | —           | To'g'ri qilingan, buzib qo'ymaslik kerak          |

Umumiy baho: **arxitektura sog'lom** — raw SQL qatlami toza parametrlangan, cookie-based auth to'g'ri, tenant
izolatsiyasi bor. Asosiy muammolar edi: **tranzaksiyalarning yo'qligi**, **FK indekslarining yo'qligi** va **enum/kod
drifti** — uchalasi ham yopildi.

### Poydevor: migratsiya tizimi

Avval hech qanday migratsiya mexanizmi yo'q edi — faqat `docker/postgres/init.sql`, u esa **yangi** bazadagina
ishlaydi. Qolgan hamma tuzatish shunga tayangani uchun birinchi bo'lib shu qo'yildi:

- `src/database/migrations/migration.runner.ts` — oldinga yo'nalgan SQL runner
- `src/database/migrations/sql/*.sql` — 7 ta migratsiya, nom tartibida qo'llanadi
- Har biri **tranzaksiyada**, `schema_migrations` jadvalida qayd etiladi
- **Checksum himoyasi:** qo'llangan migratsiya tahrirlansa, startup xato bilan to'xtaydi
- **Advisory lock:** bir nechta replika bir vaqtda ko'tarilsa poyga bo'lmaydi
- Migratsiya yiqilsa **ilova umuman ishga tushmaydi** — yarim migratsiya qilingan schemada
  trafik qabul qilishdan ko'ra to'xtash yaxshiroq (bu 007 da amalda sinaldi)

Ishga tushishi tekshirildi: bo'sh bazada `init.sql` + 7 migratsiya toza o'tdi, mavjud bazada esa
`Schema up to date (7 migrations)`.

**Tekshirilgan yakuniy holat:**

| Ko'rsatkich | Avval | Hozir |
|---|---|---|
| Indekssiz FK ustunlari | 68 | **0** |
| `updated_at` triggeri yo'q jadvallar | 25 | **0** |
| `ON DELETE` qoidasi yo'q user FK'lari | 19 | **10** (qolgani ataylab — §2.2) |
| Dublikat DM xonalari | 2 | **0** (birlashtirildi, 29 xabar saqlandi) |
| `channel` room turi | yo'q | **bor**, workspace'siz yaratiladi |

---

## 1. 🔴 Kritik

### 1.1 `channel` room turi bazada umuman yo'q 🟩

```
chat_rooms_type_enum = [public, private, workspace, project, group, direct]
```

Frontend esa `type === "channel"` bo'yicha keng shoxlanadi: `/ch/:slug` route, "Kanallar" katalogi, `leaveChannel`,
`subscribersCountDesc`, kanal sozlamalari. Backendda ham `@ApiParam({ enum: ['direct','group','channel'] })` bor.

Yagona "kanal" — `community.service.ts:31` dagi qattiq yozilgan hiyla:

```sql
CASE WHEN r.slug = 'otima-community' THEN 'channel' ELSE r.type::text
END AS type
```

Ya'ni: **OTIMA Community'dan boshqa kanal yaratib bo'lmaydi.** Butun kanal UI'si bitta tizim xonasi uchun ishlaydi.

**Tuzatildi** — (a) tanlandi, kanal to'liq birinchi darajali obyekt bo'ldi.

- `004` migratsiyasi: `chat_rooms_type_enum` ga `channel` qo'shildi
- `ChatRoomType` TS enumi DB bilan **aynan** moslashtirildi (avval DB'da TS bilmagan qiymatlar bor edi);
  izohda "bu ikkovi birga o'zgaradi" deb qayd etilgan
- `createRoom` kanal yaratadi va unga avtomatik `posting_mode = 'admins_only'` beradi (guruhga `members`)
- Frontend modalida uchinchi rejim: **Guruh / Kanal / Shaxsiy**, nom + tavsif maydonlari bilan
- `chat.sql.ts` endi `is_system`, `membership_locked`, `posting_mode`, `linked_room_id` ni ham qaytaradi —
  bular schema'da bor edi, lekin API javobiga umuman tushmasdi (yana bir drift)

`community.service.ts` dagi `CASE WHEN slug = 'otima-community'` hiylasi endi kerak emas, chunki tizim
xonasining turi bazada haqiqatan `channel` bo'lishi mumkin.

### 1.2 Ko'p yozuvli operatsiyalar tranzaksiyasiz 🟩

`DatabaseService.withTransaction()` mavjud va 10 ta joyda to'g'ri ishlatilgan. Lekin eng ko'p yozadigan servislar undan
foydalanmaydi:

| Fayl                                | Yozuv soni | Tranzaksiya |
|-------------------------------------|------------|-------------|
| `meetings/meetings.service.ts`      | 15         | ✗          |
| `chat/services/message.service.ts`  | 11         | ✗          |
| `chat/services/room.service.ts`     | 10         | ✗          |
| `chat/services/member.service.ts`   | 6          | ✗          |
| `chat/services/reaction.service.ts` | 4          | ✗          |

Aniq misol — `room.service.ts:createRoom()`: xona INSERT qilinadi → a'zolar INSERT qilinadi → notification INSERT
qilinadi. Ikkinchi so'rov yiqilsa, **a'zosiz xona** bazada qolib ketadi.

**Tuzatildi:**

- `createRoom` — xona + a'zolar + bildirishnomalar bitta `withTransaction` ichida. Bildirishnomalar endi
  `unnest($1::uuid[])` bilan bitta INSERT'da (avval faqat DM uchun va alohida edi)
- `sendMessage` — xabar + yuboruvchining o'qilgan belgisi + thread hisoblagichi + ilova (attachment) qatorlari
  bitta tranzaksiyada. Avval ilova INSERT'i yiqilsa, xabar ilovasiz saqlanib qolardi — boshqalarga bo'sh
  pufakcha bo'lib ko'rinardi va hech qanday qayta urinish uni to'ldirmasdi

### 1.3 DM juftligi uchun unique constraint yo'q 🟩

Ikki foydalanuvchi orasida bitta DM bo'lishi kerak, lekin buni faqat kod tekshiradi (`SELECT ... LIMIT 1`, keyin
`INSERT`). Constraint yo'q, tranzaksiya ham yo'q → ikki tomon bir vaqtda yozsa, ikkita xona paydo bo'ladi.

Hozirgi bazada aynan shu holat bor: `1b4e3048…` (1 xabar) va `94cd3351…` (27 xabar) — bitta juftlik uchun ikkita xona.

**Tuzatildi:**

- `chat_rooms.dm_key` ustuni — juftlik kanonik tartibda (`kichik_id:katta_id`), `chat_members` o'zgarganda
  trigger orqali avtomatik yangilanadi
- `uq_chat_rooms_dm_pair` unique indeksi — dublikat endi **bazada imkonsiz** (sinab ko'rildi: ikkinchi
  INSERT `duplicate key value violates unique constraint` bilan rad etiladi)
- `005` migratsiyasi mavjud dublikatlarni **birlashtirdi**: xabarlari ko'p bo'lgan xona qoladi, qolganlarining
  xabarlari `created_at` bo'yicha qayta raqamlanib ko'chiriladi, `message_seq` / `last_message_id` /
  `last_read_seq` qayta hisoblanadi. Natija: 2 ta xona → 1 ta, **29 ta xabarning bittasi ham yo'qolmadi**
- Kod tomonida `directPairKey()` — indeks ishlatadigan aynan shu kalitni hisoblaydi, ya'ni tekshiruv va
  constraint hech qachon bir-biriga zid bo'lolmaydi
- Poyga qolsa ham 500 bermaydi: unique violation ushlanib, yutqazgan so'rov g'olib yaratgan xonani qaytaradi

### 1.4 `users.email` unique + soft delete ziddiyati 🟩

`users` da `deleted_at` bor (soft delete), lekin `UNIQUE (email)` — oddiy, shartsiz.

Natija: o'chirilgan foydalanuvchi emailini **hech kim, hech qachon** qayta ishlata olmaydi, hatto o'zi ham qayta
ro'yxatdan o'ta olmaydi. `username` da ham shu muammo.

**Tuzatildi** (`002`): eski shartsiz constraint'lar olib tashlanib, o'rniga partial unique indekslar qo'yildi —
`uq_users_email_live` va `uq_users_username_live`, ikkalasi ham `WHERE deleted_at IS NULL` va `lower(...)` bo'yicha
(qidiruvlar ham shu ifodadan foydalanadi). Constraint nomlari TypeORM'ning hash nomlari bo'lgani uchun (`UQ_97672ac8…`,
muhitdan muhitga farq qiladi) migratsiya ularni **nomi bo'yicha emas, ustuni bo'yicha** topadi.

---

## 2. 🟠 Muhim

### 2.1 68 ta FK ustunida indeks yo'q 🟩

Foreign key ustunlari indekslanmagan. Bu ikki narsani buzadi: JOIN'lar sekin, va **ota qatorni o'chirishda** Postgres
har bir bola jadvalni to'liq skanlaydi.

Eng og'riqlilari (issiq yo'llarda):

```
chat_members.user_id          chat_messages.sender_id
chat_rooms.workspace_id       chat_rooms.last_message_id
message_attachments.message_id  workspace_members.user_id
tasks.assignee_id             tasks.project_id
tasks.column_id               notifications.actor_id
meeting_participants.user_id  project_columns.project_id
```

To'liq ro'yxat 68 ta — pastdagi so'rov bilan qayta olinadi:

```sql
SELECT c.conrelid::regclass||'.'||a.attname
FROM pg_constraint c
         JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND array_length(c.conkey, 1) = 1
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = a.attnum);
```

`chat_members.user_id` alohida muhim: `listRooms` har chaqirilganda shu bo'yicha filtrlaydi.

**Tuzatildi** (`001`): 68 ta indeks qo'shildi. Ro'yxat qo'lda emas, `pg_constraint` dan generatsiya qilindi —
shuning uchun to'liq. Yuqoridagi so'rov hozir **0** qaytaradi.

### 2.2 19 ta FK `ON DELETE NO ACTION` — foydalanuvchini o'chirib bo'lmaydi 🟩⬛

`users` ga qaragan 19 ta FK'da o'chirish qoidasi yo'q:

```
chat_messages.sender_id      chat_rooms.created_by
tasks.creator_id             projects.created_by / updated_by
workspaces.owner_id          groups.created_by
task_pushes.user_id / reviewed_by   notifications.actor_id
push_review_comments.author_id / resolved_by
message_attachments.uploader_id     tags.created_by
task_activities.user_id      task_dependencies.created_by
workspace_invitations.invited_by    meeting_join_requests.reviewed_by
```

`DELETE FROM users` **FK xatosi bilan yiqiladi**. Hozir soft delete ishlatilgani uchun sezilmayapti, lekin GDPR-uslub
"hisobni butunlay o'chirish" talab qilinsa, ishlamaydi.

**Qisman tuzatildi** (`003`) — ataylab qisman:

- **Nullable muallif/aktor ustunlari (8 ta)** → `ON DELETE SET NULL`. Kontent muallifisiz ham yashaydi; kod
  allaqachon buni ko'taradi (masalan `message.service.ts` bo'sh join natijasini `sender: null` ga o'giradi)
- **`workspaces.owner_id`** → aniq `ON DELETE RESTRICT`. Egasiz workspace — yaroqsiz holat; egalikni avval
  o'tkazish kerak, shovqin bilan yiqilishi **to'g'ri** xatti-harakat
- **NOT NULL muallif ustunlari (10 ta)** → ⬛ **ataylab tegilmadi**. Ularni nullable qilish semantik o'zgarish
  (har bir o'qish yo'li muallif borligiga tayanadi) va u "hisobni anonimlashtirish" funksiyasiga tegishli,
  constraint tozalashga emas. Bugungi o'chirish oqimi soft delete (`users.deleted_at`) bilan qoplangan

### 2.3 25 ta jadvalda `updated_at` yangilanmaydi 🟩

`updated_at` ustuni bor, lekin trigger yo'q — qiymat INSERT paytidagi holicha qotib qoladi:

```
meetings          workspace_members   user_settings      groups
notes             project_columns     repositories       earnings
message_drafts    user_chat_settings  github_accounts    education_* (5 ta)
meeting_recordings  meeting_join_requests  push_review_comments
user_notification_prefs  user_violations  ip_rate_limits
developer_project_stats  workspace_github_installations  group_members
```

**Tuzatildi** (`002`): `update_updated_at()` funksiyasi mavjud edi, qolgan 25 jadvalga ham ulandi. 25 ta alohida
`CREATE TRIGGER` emas, `DO` bloki ichida schema'ning o'zidan olingan ro'yxat bo'yicha — ya'ni yangi jadval
qo'shilsa ham mantiq bir xil qoladi. Tekshiruv so'rovi hozir **0** qaytaradi.

### 2.4 `chat_rooms.workspace_id` NULL bo'lishi mumkin, lekin so'rovlar buni hisobga olmaydi 🟩

NULL bo'lishi ataylab (standalone/community xonalar uchun), lekin `listRooms` `WHERE r.workspace_id = $1` deydi — NULL
hech qachon moslashmaydi. Shuning uchun community xonalari alohida `community.service` orqali olinadi. Ishlaydi, lekin
ikkita parallel yo'l — oson buziladigan joy.

**Tuzatildi** — model haqiqatga moslashtirildi: **DM, guruh va kanal workspace'ga tegishli emas.**

- `007` migratsiyasi: mavjud DM'larning `workspace_id` si NULL ga o'tkazildi (`scope` ham `private` ga —
  `chk_chat_rooms_scope_workspace` shuni talab qiladi), va `chk_direct_rooms_have_no_workspace` CHECK
  constraint'i qo'shildi, ya'ni buni endi hech qanday yangi kod yo'li buzolmaydi
- `chat_rooms.workspace_id` NOT NULL emas — guruh/kanal ham workspace'siz bo'ladi
- `queryRooms(userId, workspaceId | null)` — bitta so'rov ikkala rejimga xizmat qiladi; workspace berilganda
  ham DM/guruh/kanal chiqib ketmaydi
- **Yangi:** `GET /api/v1/chat/rooms` va `POST /api/v1/chat/rooms` — yo'lda workspace yo'q, JWT o'zi yetarli.
  Workspace'li eski route'lar shu ma'lumotning filtrlangan ko'rinishi sifatida qoldi
- Frontend `api.chat.rooms()` / `api.chat.createRoom()` ham workspace'siz

### 2.5 `refresh_tokens` da 86 qator, tozalash yo'q 🟩

2 ta foydalanuvchiga 86 ta refresh token. Muddati o'tganlarini o'chiradigan job yo'q — jadval cheksiz o'sadi.

**Tuzatildi** (`006` + `session.service.ts`): bir martalik tozalash migratsiyada, davomiyi esa
`persistRefreshToken` ichida — faqat shu foydalanuvchi uchun, allaqachon yozayotgan yo'lda. Scheduler yoki
yangi bog'liqlik kerak emas, ya'ni saqlab turish uchun ortiqcha infratuzilma yo'q. Xatosi login'ni yiqitmaydi.
`idx_refresh_tokens_user_expiry` indeksi ham shu tozalashga, ham "faol sessiyalarim" ro'yxatiga xizmat qiladi.

### 2.6 `chat_rooms.slug` da global unique yo'q 🟩

Unique faqat partial: `UQ_chat_rooms_system_slug ... WHERE is_system = true`. Oddiy guruhlar uchun slug takrorlanishini
faqat kod tekshiradi (`updateRoomSettings` dagi `SELECT ... WHERE lower(slug) = $1`) — race'ga ochiq.

**Tuzatildi** (`002`): `uq_chat_rooms_slug_live` — `lower(slug)` bo'yicha, `WHERE slug IS NOT NULL`. Registrga
sezgir emas, chunki barcha qidiruvlar `lower(slug)` ishlatadi.

### 2.7 `chat_room_public_id_registry` kodda umuman ishlatilmaydi ⬛

Jadval faqat init.sql'dagi trigger orqali to'ldiriladi, backend TypeScript kodida bironta ham murojaat yo'q.

**Tekshirildi — bu to'g'ri, tegilmadi.** Ikkala registry ham 6 xonali `public_id` larning bir marta ishlatilishini
kafolatlaydi va butunlay trigger darajasida ishlaydi (`reserve_six_digit_public_id`,
`reserve_six_digit_room_public_id`, `protect_room_public_id`). Ilova kodi ularga murojaat qilmasligi **kerak** —
aynan shu narsa tasodifiy qayta ishlatishdan va public_id ni o'zgartirib yuborishdan himoya qiladi. O'lik kod emas.

---

## 3. 🟡 O'rta

| #   | Topilma                                          | Izoh                                                                                                                                                                                             |
|-----|--------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 3.1 | Entity fayllari ishlatilmaydi                    | `src/database/entities/` da 47 ta entity bor, lekin kod hammasini raw SQL bilan yozadi. Entity'lar faqat tip sifatida xizmat qiladi va schema bilan sinxronligi hech narsa bilan tekshirilmaydi. |
| 3.2 | Migratsiya tizimi yo'q                           | Faqat `docker/postgres/init.sql`, u esa **yangi baza**dagina ishlaydi. Mavjud bazani o'zgartirish uchun qo'lda SQL yozish kerak. Shu hisobotdagi tuzatishlar uchun ham migratsiya kerak bo'ladi. |
| 3.3 | `chat_rooms` da 27 ta ustun                      | Bitta jadvalda room + community + appearance + routing maydonlari aralashgan. Ko'pchiligi DM'lar uchun doim NULL.                                                                                |
| 3.4 | `user_notification_prefs` da 35 ta ustun         | Har bir notifikatsiya turi alohida boolean ustun. Yangi tur qo'shish = schema o'zgartirish. JSONB yoki qator-asosli model mosroq.                                                                |
| 3.5 | `tasks` da 34 ta ustun, `education_videos` da 28 | Bo'lish haqida o'ylash kerak.                                                                                                                                                                    |
| 3.6 | `enrichRoom` N+1                                 | Har bir xona uchun alohida `fetchLastMessage` so'rovi. `listRooms` da to'g'ri (batch), lekin `enrichRoom` bitta-bitta chaqiriladi.                                                               |

---

## 3b. 🔴 Keyingi bosqichda topilgan

### 3b.1 Kanal egasi o'z kanaliga yoza olmaydi 🟩

`message.service.ts` da kanal yozish huquqi shunday tekshirilardi:

```ts
if (room.postingMode === 'admins_only' && member.user.publicId !== '777777')
  throw new ForbiddenException({ code: 'CHANNEL_ADMIN_ONLY', ... });
```

`'777777'` — qattiq yozilgan sehrli hisob raqami. Oqibati: **har bir haqiqiy kanal egasi o'z kanalidan
qulflangan** (aynan siz ko'rgan `Only channel admins can publish posts` xatosi), huquqni deploy'siz berib ham,
olib ham bo'lmaydi, va o'sha ketma-ketlik qiymatiga tushib qolgan tasodifiy foydalanuvchi jimgina admin bo'lib
qoladi. (`education-sync.service.ts` da xuddi shu sehrli raqam bor edi va aynan shu sabablarga ko'ra
allaqachon olib tashlangan.)

**Tuzatildi:** huquq endi `chat_members.role` bo'yicha — `owner` yoki `admin`. `createRoom` xona yaratuvchisiga
avtomatik `owner` rolini beradi. Tekshirildi: egasi o'z kanaliga yozганda **201**.

---

## 3c. 🛡️ "Postman'dan API'ni ursa nima bo'ladi?"

Savolga da'vo bilan emas, dalil bilan javob: `backend/scripts/probe-chat-authorization.js`
(`npm run probe:chat-auth`). Skript o'zi JWT mintlaydi (parol kerak emas) va **haqiqiy HTTP yuzasini**
begona, lekin tizimga kirgan foydalanuvchi sifatida uradi.

Muhim nuqta: **tizimga kirgan ≠ ruxsat berilgan.** Chat'dagi barcha route'lar JWT guard ortida (`@Public()`
bittasi ham yo'q), lekin asosiy himoya — `chat_members` dagi a'zolik: xonaga a'zo bo'lmasang, uni o'qiy ham,
o'zgartira ham olmaysan.

**Natija: 15/15**

| Harakat | Kutilgan | Natija |
|---|---|---|
| Egasi o'z kanaliga yozadi | ruxsat | `201` |
| Egasi o'z kanalini qayta nomlaydi | ruxsat | `200` |
| Begona xabarlarni o'qiydi | bloklanadi | `403 NOT_ROOM_MEMBER` |
| Begona xabar yozadi | bloklanadi | `403 NOT_ROOM_MEMBER` |
| Begona kanalni qayta nomlaydi | bloklanadi | `403 NOT_ROOM_MEMBER` |
| Begona kanalni o'chiradi | bloklanadi | `403 INSUFFICIENT_PERMISSIONS` |
| Begona taklif havolalarini ko'radi | bloklanadi | `403` |
| Begona taklif havolasi yaratadi | bloklanadi | `403 NOT_ROOM_MEMBER` |
| Begona a'zolar ro'yxatini o'qiydi | bloklanadi | `403 NOT_ROOM_MEMBER` |
| Begona "ochiq xona" deb qo'shiladi | bloklanadi | `403 ROOM_NOT_PUBLIC` |
| Soxta token (boshqa secret) | bloklanadi | `401 TOKEN_INVALID` |
| Tokensiz | bloklanadi | `401 TOKEN_INVALID` |
| Body'ga noma'lum maydon (`isSystem: true`) | bloklanadi | `400 VALIDATION_ERROR` |
| Soxta room turi (`workspace`) | bloklanadi | `400 VALIDATION_ERROR` |
| O'zi bilan DM | bloklanadi | `400 DM_WITH_SELF` |

Skript xato chiqsa **non-zero** bilan tugaydi — CI'ga ulasa bo'ladi.

Alohida ta'kidlash kerak: `isSystem: true` yuborib tizim xonasi yasab bo'lmaydi — `forbidNonWhitelisted`
so'rovni butunlay rad etadi. Undan o'tib ketgan taqdirda ham `trg_protect_otima_system_room` triggeri bazada
to'xtatadi. Ikki qatlam.

---

## 4. 🟢 To'g'ri qilingan (buzib qo'ymaslik kerak)

1. **SQL injection yo'q.** Barcha dinamik `WHERE` bandlari (`buildTaskFilters`, `buildUpdateSet`, `daily-stats`)
   parametr indekslarini to'g'ri hisoblaydi, qiymatlar hech qachon satrga qo'shilmaydi. `ORDER BY ${…}` shakli butun
   kodda umuman uchramaydi.
2. **Auth to'liq httpOnly cookie'da.** `JwtStrategy`, `JwtRefreshStrategy` va Socket.IO gateway — uchalasi ham tokenni
   faqat cookie'dan o'qiydi, Authorization header e'tiborga olinmaydi. XSS token o'g'irlay olmaydi.
3. **Validation qattiq.** `whitelist: true` + `forbidNonWhitelisted: true` — noma'lum maydon so'rovni rad etadi.
4. **Tenant izolatsiyasi izchil.** `assertMember` / `assertRoomMember` deyarli har bir servis metodining boshida
   chaqiriladi.
5. **Himoya triggerlari.** `trg_protect_otima_system_room`, `trg_protect_locked_chat_membership`,
   `trg_protect_user_public_id`, `trg_protect_room_public_id` — tizim ma'lumotlarini kod xatosidan ham himoyalaydi.

---

## 5. Migratsiyalar

| Fayl | Nima qiladi | Bog'liq bo'lim |
|---|---|---|
| `001_fk_indexes.sql` | 68 ta FK indeksi | 2.1 |
| `002_integrity_and_timestamps.sql` | 25 ta `updated_at` trigger, `users` partial unique, slug unique | 1.4, 2.3, 2.6 |
| `003_user_delete_rules.sql` | `ON DELETE SET NULL` / `RESTRICT` | 2.2 |
| `004_room_kinds_and_dm_uniqueness.sql` | `channel` enum, workspace ixtiyoriy, `dm_key` + trigger | 1.1, 1.3, 2.4 |
| `005_merge_duplicate_dms.sql` | Dublikat DM'larni birlashtirish + unique indeks | 1.3 |
| `006_refresh_token_hygiene.sql` | Eski tokenlarni tozalash + indeks | 2.5 |
| `007_detach_dms_from_workspaces.sql` | DM'lardan workspace'ni uzish + CHECK constraint | 2.4 |

Ishga tushirish kerak emas — ilova ko'tarilganda avtomatik qo'llanadi. Qo'lda to'xtatish: `SKIP_MIGRATIONS=true`.

Yangi migratsiya qo'shish: `src/database/migrations/sql/` ga `NNN_nom.sql` yaratish, tamom. **Qo'llangan faylni
tahrirlash mumkin emas** — checksum mos kelmasa startup to'xtaydi; o'rniga yangi migratsiya yozing.

---

## 6. Qolgan ish

**Ataylab qilinmadi (qaror bilan):**

- **2.2** — 10 ta NOT NULL muallif ustuni tegilmadi. Buning uchun "hisobni anonimlashtirish" funksiyasi kerak,
  constraint tozalash yetarli emas. Soft delete bugungi ehtiyojni qoplaydi.
- **2.7** — registry jadvallari to'g'ri ishlayapti, tegish shart emas.

**Hali ochiq (🟡 O'rta, 4 ta):**

- **3.1** Entity fayllari va schema o'rtasida avtomatik tekshiruv yo'q. Endi migratsiya tizimi borligi uchun
  buni CI'da schema-diff bilan yopish mumkin.
- **3.3 / 3.4 / 3.5** Keng jadvallar (`chat_rooms` 28, `tasks` 34, `user_notification_prefs` 35 ustun).
  Ishlashga hozircha ta'sir qilmaydi.
- **3.6** `enrichRoom` dagi N+1 — `listRooms` allaqachon batch qiladi, `enrichRoom` esa bitta xona uchun
  chaqiriladi, shuning uchun amalda zarari yo'q.

**Yopilgan savollar:**

1. ~~Kanal~~ → to'liq qo'llab-quvvatlanadi, workspace'siz yaratiladi
2. ~~Foydalanuvchini o'chirish~~ → soft delete qoladi; nullable FK'lar `SET NULL`, workspace egasi `RESTRICT`
3. ~~Dublikat DM~~ → birlashtirildi, 29 xabar butun saqlandi
4. ~~Registry jadvallari~~ → kerak, trigger darajasida to'g'ri ishlayapti
