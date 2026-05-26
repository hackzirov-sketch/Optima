# UPZ Frontend - Next.js

O'zbekiston Professional Zumradi platformasi uchun frontend qism.

## Texnologiyalar

- **Framework**: Next.js 15 (App Router)
- **UI**: React 19, Tailwind CSS
- **Components**: Radix UI, shadcn/ui
- **State Management**: TanStack Query, Zustand
- **Forms**: React Hook Form + Zod
- **Animations**: Framer Motion
- **i18n**: react-i18next
- **Icons**: Lucide React, React Icons

## O'rnatish

```bash
npm install
```

## Ishga tushirish

Development:
```bash
npm run dev
```

Production build:
```bash
npm run build
npm start
```

## Loyiha strukturasi

```
app/
├── (auth)/
│   └── onboarding/      # Onboarding wizard
├── app/                 # Authenticated pages
│   ├── home/
│   ├── dashboard/
│   ├── workspace/
│   ├── chat/
│   ├── meetings/
│   ├── premium/
│   ├── community/
│   ├── news/
│   ├── bank/
│   ├── assistant/
│   ├── teams/
│   ├── projects/
│   ├── tasks/
│   ├── profile/
│   └── settings/
├── globals.css          # Global styles
├── layout.tsx           # Root layout
├── page.tsx             # Landing page
└── providers.tsx        # React Query, Theme providers

components/
├── ui/                  # Reusable UI components (shadcn)
├── landing/             # Landing page components
├── app/                 # App-specific components
├── chat/                # Chat components
└── premium/             # Premium page components

hooks/
├── useAuth.ts           # Authentication hook
└── ...                  # Other custom hooks

lib/
└── utils.ts             # Utility functions

types/
└── index.ts             # TypeScript types

utils/
└── storage.ts           # LocalStorage wrapper

i18n/
└── ...                  # Internationalization

data/
└── mockData.ts          # Mock data
```

## Environment Variables

`.env.local` faylini yarating va quyidagi o'zgaruvchilarni qo'shing:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Backend Integration

Backend API: `../backend` papkasida joylashgan NestJS proyekti bilan ishlaydi.

Backend ishga tushirish:
```bash
cd ../backend
npm install
npm run start:dev
```

## Deployment

Vercel yoki boshqa Next.js hosting platformalariga deploy qilish mumkin:

```bash
npm run build
```

## License

Private
