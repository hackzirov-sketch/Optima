'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/app/DesignSystem';

const TABS = [
  { label: 'Overview',  href: '/app/workspace' },
  { label: 'Members',   href: '/app/workspace/members' },
  { label: 'Invites',   href: '/app/workspace/invites' },
  { label: 'Settings',  href: '/app/workspace/settings' },
];

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-0">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <nav className="flex gap-1 px-4 pt-2">
          {TABS.map((tab) => {
            const active = tab.href === '/app/workspace'
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'rounded-t-xl px-4 py-2.5 text-sm font-semibold transition-colors',
                  active
                    ? 'border border-b-background border-border bg-background text-foreground -mb-px'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="pt-5">{children}</div>
    </div>
  );
}
