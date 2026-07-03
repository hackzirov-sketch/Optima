# 1-bosqich: Bloklovchi xatolar tuzatildi

Reja (avvalgi diagnostikadan): 1) notification enum → 2) meeting join/invite →
3) roles audit → 4) guard/filter → 5) i18n → 6) Gemini → 7) recording → 8) notes.
Bu round **1, 2 va 6-bandlarni** to'liq yopdi (3,4,5,7,8 hali qolgan — pastda izoh).

## 1. Notification enum — 500 xatosi tuzatildi
**Fayl:** `backend/src/database/migrations/1783600000000-FixNotificationTypeEnum.ts` (yangi)

Postgres'dagi `notifications_type_enum`ga yetishmayotgan 6 ta qiymat qo'shildi:
`task_completed`, `task_status_changed`, `project_member_invite`,
`project_member_accepted`, `project_member_declined`, `meeting_invite`.

**Ishga tushirish:** `npm run migration:run` (yoki loyihangizdagi mos buyruq).
Bu migratsiya faqat qo'shadi (additive), eski qatorlarga tegmaydi — xavfsiz.

## 2. Meeting join — WS va REST birlashtirildi + invite self-bug
**Fayllar:**
- `backend/src/modules/gateway/gateway.module.ts` — `MeetingsModule` ulandi (`forwardRef` bilan, chunki `Gateway → Meetings → Notifications → Gateway` aylanma bog'liqlik hosil bo'ladi)
- `backend/src/modules/gateway/events.gateway.ts` — `meeting:join` endi `MeetingsService.join()` orqali **haqiqiy tekshiruvdan** o'tadi (workspace a'zoligi, meeting holati, sig'im) va `meeting_participants`ga yozadi. Xato bo'lsa `meeting:error` eventi bilan client'ga qaytariladi, socket xonaga qo'shilmaydi. Socket uzilganda/leave bo'lganda `leftAt` DB'ga yoziladi.
- `backend/src/modules/meetings/meetings.service.ts` — `inviteMembers` endi inviter'ni o'z ro'yxatidan server tomonida ham chiqarib tashlaydi (frontend buzilsa ham himoyalangan).
- `frontend/components/meeting/MeetingCallView.tsx` — invite modal endi hostni va allaqachon call'da bo'lganlarni ro'yxatdan chiqaradi (`currentUserId` prop orqali).
- `frontend/app/app/meetings/page.tsx` — `currentUserId={backendUser?.id}` uzatildi.

**Natija:** "userlar bir-birining meetiga qo'shila olmayapti" muammosi — WS endi DB bilan sinxron ishlaydi, real ishtirokchi ro'yxati va ruxsat tekshiruvi to'g'ri ishlaydi.

## 6. Gemini AI — model yangilandi
**Fayllar:**
- `backend/src/modules/chat/services/ai.service.ts` — `gemini-1.5-flash` (butunlay o'chirilgan, 404 qaytarardi) o'rniga `gemini-2.5-flash` (joriy GA model). Model nomi endi `GEMINI_MODEL` env orqali sozlanadi (keyingi deprecation'da kod o'zgartirish shart emas). Xato log darajasi `warn`dan `error`ga ko'tarildi — muammo yashirin qolmasin.
- `backend/src/config/env/env.schema.ts` — `GEMINI_MODEL?` optional env qo'shildi.
- `frontend/components/meeting/MeetingCallView.tsx` — Meeting'dagi "AI" tab endi statik "tez orada" emas, **haqiqiy chat** (`/chat/ai`ni chaqiradi, meeting sarlavhasi kontekst sifatida yuboriladi, tarix saqlanadi).

**Eslatma:** `.env`da `GEMINI_API_KEY` to'g'ri turgan bo'lishi kerak, aks holda tizim avtomatik fallback javoblarga o'tadi (bu — dizayn bo'yicha, backend cho'kib qolmasligi uchun).

---

## Hali qolgan bandlar (keyingi bosqichlar)
- **3) Rollar** — 7 ta rol (owner/admin/lead/senior/middle/junior/guest) qaysi guard'larda ishlatilayotganini audit qilib, MVP uchun soddalashtirish
- **4) Guard/filter** — controller'lar bo'yicha yozilgan-lekin-ulanmagan guard'larni topish
- **5) i18n/error-code** — 7 til (uz,ru,en,ar,tr,kk,ky) uchun markaziy tarjima jadvali; hozir `ErrorCode` enum bor, lekin mesajlar hardcoded inglizcha
- **7) Recording** — noldan: R2'ga yozish, 1 soat auto-stop, `MeetingRecording` entity
- **8) Meeting notes** — noldan: sizning aytgan struktura (`id uuid, meetingId, userId, content, createdAt, deletedAt`) + transcript yoki qo'lda yozish qarori kerak

Qaysi banddan davom etishni xohlaysiz?

---

## Fix v2: circular dependency crash on boot (UndefinedModuleException)

Real cycle turned out to be **3 modules wide**, entered from two directions:
`WorkspacesModule → NotificationsModule → GatewayModule → MeetingsModule → WorkspacesModule`.

`forwardRef()` on only the `GatewayModule → MeetingsModule` edge wasn't enough —
Nest still eagerly resolved the `NotificationsModule → GatewayModule` edge and crashed.
Fixed by adding `forwardRef()` on **both ends** of that second edge too:

- `backend/src/modules/notifications/notifications.module.ts` — `GatewayModule` import now wrapped in `forwardRef(() => GatewayModule)`
- `backend/src/modules/notifications/notifications.service.ts` — `EventsGateway` constructor injection now wrapped in `@Inject(forwardRef(() => EventsGateway))`

Both edges of the cycle (`Notifications↔Gateway` and `Gateway↔Meetings`) are now deferred, so the module graph resolves regardless of which module `AppModule` loads first.
