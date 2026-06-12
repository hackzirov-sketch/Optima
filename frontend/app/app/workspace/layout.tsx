'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ChevronLeft, LayoutDashboard, Users, Workflow } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/components/app/DesignSystem';

const PRIMARY_TABS = [
  { label: 'Board',      href: '/app/workspace/board',      icon: LayoutDashboard },
  { label: 'Analytics',  href: '/app/workspace/analytics',  icon: BarChart3 },
  { label: 'Automation', href: '/app/workspace/automation', icon: Workflow },
  { label: 'Team',       href: '/app/workspace/team',       icon: Users },
];

const MGMT_TABS = [
  { label: 'Members',  href: '/app/workspace/members' },
  { label: 'Invites',  href: '/app/workspace/invites' },
  { label: 'Settings', href: '/app/workspace/settings' },
];

const MGMT_PREFIXES = MGMT_TABS.map((t) => t.href);

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMgmt = MGMT_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <div className="flex h-full flex-col">
      {isMgmt ? (
        <div className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2 px-4 pt-2">
            <Link
              href="/app/workspace/team"
              className="flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Workspace
            </Link>
            <span className="text-border">/</span>
            <nav className="flex gap-1">
              {MGMT_TABS.map((tab) => {
                const active = pathname.startsWith(tab.href);
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
        </div>
      ) : (
        <div className="flex-shrink-0 border-b border-border px-6 py-3">
          <nav className="inline-flex gap-0.5 rounded-xl border border-border bg-card p-1">
            {PRIMARY_TABS.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href ||
                (pathname === '/app/workspace' && href === '/app/workspace/board');
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'relative flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors duration-150',
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="workspace-tab-pill"
                      className="absolute inset-0 rounded-lg bg-secondary shadow-sm"
                      transition={{ type: 'spring', bounce: 0.18, duration: 0.38 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <div className={cn('min-h-0 flex-1', isMgmt ? 'pt-5' : 'pt-4')}>
        {children}
      </div>
    </div>
  );
}
