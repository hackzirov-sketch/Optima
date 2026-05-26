# 🚀 UPZ Frontend - Next.js 15

O'zbekiston Professional Zumradi platformasi uchun yangi Next.js frontend.

## ✨ Nima o'zgardi?

### React Router → Next.js App Router
- ✅ Vite + React Router o'rniga **Next.js 15 App Router**
- ✅ Wouter navigation o'rniga **next/navigation** 
- ✅ Client-side routing o'rniga **Server + Client Components**
- ✅ Manual routing o'rniga **file-based routing**

### Loyiha strukturasi

```
upz-nextjs-frontend/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout (Theme, i18n, React Query)
│   ├── page.tsx                 # Landing page (/)
│   ├── providers.tsx            # Client providers
│   ├── globals.css              # Global styles + Tailwind
│   │
│   ├── onboarding/              # Onboarding wizard (/onboarding)
│   │   └── page.tsx
│   │
│   └── app/                     # Authenticated pages (/app/*)
│       ├── home/                # Dashboard (/app/home)
│       ├── dashboard/           # Analytics (/app/dashboard)
│       ├── workspace/           # Workspace (/app/workspace)
│       ├── chat/                # Chat (/app/chat)
│       ├── meetings/            # Video meetings (/app/meetings)
│       ├── premium/             # Premium features (/app/premium)
│       ├── community/           # Community (/app/community)
│       ├── news/                # News feed (/app/news)
│       ├── bank/                # Bank integration (/app/bank)
│       ├── assistant/           # AI Assistant (/app/assistant)
│       ├── teams/               # Teams (/app/teams)
│       ├── projects/            # Projects (/app/projects)
│       ├── tasks/               # Tasks & Notes (/app/tasks)
│       ├── profile/             # User profile (/app/profile)
│       └── settings/            # Settings (/app/settings)
│
├── components/
│   ├── ui/                      # shadcn/ui components (40+)
│   ├── landing/                 # Landing page sections
│   ├── app/                     # App layout components
│   ├── chat/                    # Chat components
│   ├── premium/                 # Premium components
│   └── ThemeToggle.tsx          # Theme switcher
│
├── hooks/
│   └── useAuth.ts               # Authentication hook (localStorage based)
│
├── lib/
│   └── utils.ts                 # Utility functions (cn, etc.)
│
├── types/
│   └── index.ts                 # TypeScript types
│
├── utils/
│   └── storage.ts               # LocalStorage wrapper
│
├── data/
│   └── mockData.ts              # Mock data
│
├── i18n/                        # Internationalization
│   ├── index.ts                 # i18n config
│   └── locales/                 # Translation files
│       ├── uz.json              # O'zbekcha
│       ├── en.json              # English
│       ├── ru.json              # Русский
│       ├── ar.json              # العربية
│       └── tr.json              # Türkçe
│
└── public/                      # Static assets
    ├── animations/              # Lottie animations
    ├── images/                  # Images
    └── emojis/                  # Emoji assets
```

## 🛠 O'rnatish

### 1. Proyektni ochish

```bash
tar -xzf upz-nextjs-frontend.tar.gz
cd upz-nextjs-frontend
```

### 2. Dependencies o'rnatish

```bash
npm install
```

### 3. Environment variables

`.env.local` faylini yarating:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=UPZ
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Development server

```bash
npm run dev
```

Brauzerda oching: **http://localhost:3000**

## 🔗 Backend bilan bog'lash

Backend (NestJS) proyekti alohida papkada:

```bash
cd ../backend
npm install
npm run start:dev
```

Backend API: **http://localhost:3001**

## 📦 Asosiy dependencies

### Framework & UI
- **next**: 15.1.4 - React framework
- **react**: 19.0.0 - UI library
- **tailwindcss**: 3.4.17 - Utility-first CSS
- **@radix-ui/react-***: Accessible UI primitives
- **framer-motion**: 11.15.0 - Animations

### State & Forms
- **@tanstack/react-query**: 5.62.11 - Server state
- **react-hook-form**: 7.55.0 - Form management
- **zod**: 3.24.1 - Schema validation

### i18n & Icons
- **react-i18next**: 17.0.6 - Internationalization
- **lucide-react**: 0.468.0 - Icons

## 🎨 Mavjud page'lar

### Public (Auth kerak emas)
- `/` - Landing page
- `/onboarding` - Onboarding wizard

### Authenticated (`/app/*`)
- `/app/home` - Dashboard
- `/app/dashboard` - Analytics va statistika
- `/app/workspace` - Ish maydoni
- `/app/chat` - Chat va messaging
- `/app/meetings` - Video uchrashuvlar
- `/app/premium` - Premium xususiyatlar
- `/app/community` - Jamiyat
- `/app/news` - Yangiliklar
- `/app/bank` - Bank integratsiyasi
- `/app/assistant` - AI yordamchi
- `/app/teams` - Jamoalar
- `/app/projects` - Proyektlar
- `/app/tasks` - Vazifalar va eslatmalar
- `/app/profile` - Foydalanuvchi profili
- `/app/settings` - Sozlamalar

## 🔐 Authentication

Hozirda **localStorage** orqali ishlaydi (`useAuth` hook):

```typescript
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { user, logout, login, isAuthenticated } = useAuth();
  
  // user - foydalanuvchi ma'lumotlari
  // logout - tizimdan chiqish
  // login - tizimga kirish
  // isAuthenticated - autentifikatsiya holati
}
```

**Backend bilan integratsiya qilganingizda** `useAuth` hookini o'zgartirishingiz kerak bo'ladi (JWT, cookies, etc.)

## 🌍 Tillar

5 ta til support qiladi:
- 🇺🇿 O'zbekcha
- 🇬🇧 English
- 🇷🇺 Русский
- 🇸🇦 العربية (Arabic)
- 🇹🇷 Türkçe

Tilni o'zgartirish:
```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t, i18n } = useTranslation();
  
  // Til o'zgartirish
  i18n.changeLanguage('uz');
  
  // Tarjima
  const title = t('landing.hero.title');
}
```

## 🚀 Production build

```bash
npm run build
npm start
```

## 📝 Keyingi qadamlar

1. **Backend API integratsiya**
   - `useAuth` hookini JWT bilan o'zgartirish
   - API client (axios/fetch) qo'shish
   - Error handling

2. **Real data**
   - Mock data o'rniga real API calls
   - Loading states
   - Error boundaries

3. **Testing**
   - Unit tests (Jest)
   - E2E tests (Playwright)

4. **Deployment**
   - Vercel / Netlify / Custom server
   - Environment variables
   - CI/CD pipeline

## 💡 Muhim eslatmalar

- ✅ Barcha UI componentlar `components/ui` da (shadcn/ui based)
- ✅ Barcha page'lar `'use client'` directive bilan (client components)
- ✅ Routing file-based (Next.js App Router)
- ✅ Theme support (light/dark mode)
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ i18n tayyor (5 til)

## 🐛 Muammolar?

Agar xatoliklar bo'lsa:

1. `node_modules` ni o'chirib qayta o'rnating:
```bash
rm -rf node_modules package-lock.json
npm install
```

2. Next.js cache ni tozalang:
```bash
rm -rf .next
npm run dev
```

3. TypeScript xatoliklari:
```bash
npm run typecheck
```

---

**Backend bilan ishlash uchun tayyor! 🎉**
