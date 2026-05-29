'use client';

import { ShieldCheck, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import dynamic from "next/dynamic";

const ThemeToggle = dynamic(() => import("@/components/ThemeToggle").then(m => m.ThemeToggle), { ssr: false });
const LanguageSwitcher = dynamic(() => import("@/components/landing/LanguageSwitcher").then(m => m.LanguageSwitcher), { ssr: false });

export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100 px-4 py-6 text-foreground dark:bg-[#08111F] sm:px-6 lg:px-8">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.14),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.10),transparent_30%)] dark:bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.22),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.18),transparent_30%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/10" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />

      <div className="relative mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-7xl flex-col">
        {/* ── Header ── */}
        <header className="mb-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => router.push("/")} className="group flex min-w-0 items-center gap-3 text-left">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-sm font-black text-white shadow-lg shadow-indigo-200/60 transition-transform group-hover:scale-105 dark:shadow-indigo-950/30">
              U
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-black tracking-tight">UPZ</span>
              <span className="hidden truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:block">
                Universal Productivity Zone
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <LanguageSwitcher />
          </div>
        </header>

        {/* ── Main card ── */}
        <section className="grid flex-1 overflow-hidden rounded-[34px] border border-slate-200 bg-white/90 shadow-2xl shadow-slate-300/40 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/40 lg:grid-cols-[0.95fr_1.05fr]">
          {/* ── Left panel (desktop only) ── */}
          <aside className="relative hidden overflow-hidden border-r border-slate-200 bg-slate-50 p-8 text-slate-900 dark:border-slate-800 dark:bg-[#0F1929] dark:text-white lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(99,102,241,0.1),transparent_32%),radial-gradient(circle_at_86%_20%,rgba(59,130,246,0.1),transparent_30%),linear-gradient(145deg,#f8fafc,#f1f5f9_55%,#e2e8f0)] dark:bg-[radial-gradient(circle_at_20%_12%,rgba(99,102,241,0.45),transparent_32%),radial-gradient(circle_at_86%_20%,rgba(59,130,246,0.32),transparent_30%),linear-gradient(145deg,#0B1120,#111827_55%,#172033)]" />
            <div className="pointer-events-none absolute inset-0 opacity-10 dark:opacity-30 [background-image:linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] dark:[background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:44px_44px]" />

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/5 px-3 py-1.5 text-xs font-bold text-indigo-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-indigo-200">
                <ShieldCheck className="h-4 w-4" />
                Secure MVP access
              </span>
              <h1 className="mt-7 max-w-lg text-4xl font-black tracking-tight xl:text-5xl">
                One calm account for your whole productivity zone.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-slate-600 dark:text-slate-400">
                Sign in with email or phone, create a richer profile, then enter your UPZ workspace with chat, meetings, projects, bank, news, community, and AI.
              </p>
            </div>

            <div className="relative grid gap-3">
              {[
                ["Multi-entry login",     "Email or phone sign-in for the MVP demo."],
                ["Complete registration", "Full name, email, phone, username, and password."],
                ["Workspace ready",       "Profile setup continues after account creation."],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-[24px] border border-black/5 bg-black/5 p-4 backdrop-blur-xl dark:border-white/8 dark:bg-white/5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-2xl bg-black/5 text-indigo-600 dark:bg-white/8 dark:text-indigo-300">
                      <Check className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-black text-slate-900 dark:text-white">{title}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{desc}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* ── Right panel (form area) ── */}
          <div className="flex min-h-[720px] flex-col p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
