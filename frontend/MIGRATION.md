# 🔄 Migration Guide: Optima → UPZ Next.js

## Asosiy o'zgarishlar

### 1. Routing

**Oldin (Wouter):**
```tsx
import { Link, useLocation } from 'wouter';

function MyComponent() {
  const [location, navigate] = useLocation();
  
  return (
    <Link href="/app/home">
      <button onClick={() => navigate('/app/dashboard')}>
        Dashboard
      </button>
    </Link>
  );
}
```

**Hozir (Next.js):**
```tsx
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

function MyComponent() {
  const router = useRouter();
  const pathname = usePathname();
  
  return (
    <Link href="/app/home">
      <button onClick={() => router.push('/app/dashboard')}>
        Dashboard
      </button>
    </Link>
  );
}
```

### 2. Client Components

Next.js App Router da default **Server Components**. Client state kerak bo'lsa `'use client'` qo'shish shart:

```tsx
'use client';

import { useState } from 'react';

export default function MyPage() {
  const [count, setCount] = useState(0);
  // ...
}
```

**Client directive kerak bo'ladigan holatlar:**
- `useState`, `useEffect` va boshqa React hooks
- Event handlers (`onClick`, `onChange`, etc.)
- Browser APIs (`window`, `localStorage`, etc.)
- Third-party libraries (framer-motion, etc.)

### 3. Props vs Hooks

**Oldin (Props drilling):**
```tsx
// App.tsx
<HomePage user={user} onLogout={logout} />

// HomePage.tsx
interface Props {
  user: UserProfile;
  onLogout: () => void;
}

export default function HomePage({ user, onLogout }: Props) {
  return <AppLayout user={user} onLogout={onLogout}>...</AppLayout>
}
```

**Hozir (useAuth hook):**
```tsx
// HomePage.tsx
'use client';

import { useAuth } from '@/hooks/useAuth';

export default function HomePage() {
  const { user, logout } = useAuth();
  
  if (!user) return null;
  
  return <AppLayout user={user} onLogout={logout}>...</AppLayout>
}
```

### 4. File Structure

**Oldin (Vite/React Router):**
```
src/
├── pages/
│   ├── LandingPage.tsx
│   ├── HomePage.tsx
│   └── DashboardPage.tsx
├── components/
├── App.tsx
└── main.tsx
```

**Hozir (Next.js App Router):**
```
app/
├── page.tsx              # LandingPage
├── layout.tsx            # Root layout
├── app/
│   ├── home/
│   │   └── page.tsx     # HomePage
│   └── dashboard/
│       └── page.tsx     # DashboardPage
└── components/
```

### 5. Environment Variables

**Oldin (Vite):**
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

**Hozir (Next.js):**
```typescript
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

**Muhim:** Client-side da foydalaniladigan .env variables `NEXT_PUBLIC_` bilan boshlanishi kerak!

### 6. Static Assets

**Oldin:**
```tsx
<img src="/src/assets/logo.png" />
```

**Hozir:**
```tsx
import Image from 'next/image';

<Image src="/images/logo.png" alt="Logo" width={100} height={100} />
// yoki
<img src="/images/logo.png" alt="Logo" />
```

Barcha static fayllar `public/` papkasida.

### 7. CSS/Styling

**Oldin (index.css):**
```typescript
// main.tsx
import './index.css';
```

**Hozir (globals.css):**
```typescript
// app/layout.tsx
import './globals.css';
```

Global CSS faqat root layout da import qilish mumkin.

## Component Migration Patterns

### Pattern 1: Page Component

**Oldin:**
```tsx
// src/pages/HomePage.tsx
import { useLocation } from 'wouter';

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

export default function HomePage({ user, onLogout }: Props) {
  const [location, navigate] = useLocation();
  
  return (
    <div>
      <button onClick={() => navigate('/app/dashboard')}>
        Go to Dashboard
      </button>
    </div>
  );
}
```

**Hozir:**
```tsx
// app/app/home/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function HomePage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  
  if (!user) return null;
  
  return (
    <div>
      <button onClick={() => router.push('/app/dashboard')}>
        Go to Dashboard
      </button>
    </div>
  );
}
```

### Pattern 2: Layout Component

**Oldin:**
```tsx
// App.tsx
import { Route, Switch } from 'wouter';

function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/app/home">
        <HomePage user={user} onLogout={logout} />
      </Route>
    </Switch>
  );
}
```

**Hozir:**
```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

// app/page.tsx - Landing
// app/app/home/page.tsx - Home
```

### Pattern 3: Navigation Links

**Oldin:**
```tsx
import { Link } from 'wouter';

<Link href="/app/profile">
  <a className="nav-link">Profile</a>
</Link>
```

**Hozir:**
```tsx
import Link from 'next/link';

<Link href="/app/profile" className="nav-link">
  Profile
</Link>
```

## Authentication Migration

### Oldin (Props drilling)

```tsx
// App.tsx
function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  
  const handleLogout = () => {
    storage.clearOnboarded();
    setUser(null);
  };
  
  return (
    <HomePage user={user} onLogout={handleLogout} />
  );
}
```

### Hozir (useAuth hook)

```tsx
// hooks/useAuth.ts
export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const router = useRouter();
  
  const logout = () => {
    storage.clearOnboarded();
    setUser(null);
    router.push('/');
  };
  
  return { user, logout, login };
}

// Any component
function MyComponent() {
  const { user, logout } = useAuth();
  // ...
}
```

## Common Issues & Solutions

### Issue 1: "useLocation is not defined"

**Sabab:** Wouter import qolgan.

**Yechim:**
```tsx
// ❌ Noto'g'ri
import { useLocation } from 'wouter';

// ✅ To'g'ri
import { useRouter, usePathname } from 'next/navigation';
```

### Issue 2: "Can't use useState in Server Component"

**Sabab:** Client directive yo'q.

**Yechim:**
```tsx
'use client'; // Buni qo'shish

import { useState } from 'react';
```

### Issue 3: "Module not found: @/..."

**Sabab:** Path alias noto'g'ri.

**Yechim:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### Issue 4: "Link is not defined"

**Sabab:** Next.js Link noto'g'ri import qilingan.

**Yechim:**
```tsx
// ❌ Noto'g'ri
import { Link } from 'next/link';

// ✅ To'g'ri
import Link from 'next/link';
```

## Testing Checklist

Migration'dan keyin test qilish:

- [ ] Landing page yuklanadi
- [ ] Onboarding wizard ishlaydi
- [ ] Authentication ishlaydi (login/logout)
- [ ] Barcha /app/* page'lar ochiladi
- [ ] Navigation ishlaydi (Link va router.push)
- [ ] Theme toggle ishlaydi (dark/light)
- [ ] i18n ishlaydi (til o'zgartirish)
- [ ] Responsive design ishlaydi (mobile/tablet/desktop)
- [ ] Form validation ishlaydi
- [ ] localStorage ishlaydi

## Performance Optimization

Next.js automatic optimizations:

- ✅ **Code Splitting**: Har bir page alohida bundle
- ✅ **Image Optimization**: `next/image` komponentida
- ✅ **Font Optimization**: Google Fonts automatic optimize
- ✅ **Static Generation**: Build vaqtida HTML generate
- ✅ **Automatic Prefetching**: Link componentlari prefetch qiladi

## Deployment

### Vercel (recommended)

```bash
npm run build
# Auto-deploy to Vercel
```

### Custom Server

```bash
npm run build
npm start
# or
pm2 start npm --name "upz-frontend" -- start
```

---

**Migration completed! 🎉**

Savollar yoki muammolar bo'lsa README.uz.md ni o'qing.
