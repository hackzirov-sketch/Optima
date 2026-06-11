'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

export function Header() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeHref, setActiveHref] = useState<string>("");
  const router = useRouter();
  const navigate = (path: string) => router.push(path);

  const navLinks = [
    { label: t("header.nav.features"), href: "#features" },
    { label: t("header.nav.howItWorks"), href: "#how-it-works" },
    { label: t("header.nav.forWhom"), href: "#for-whom" },
    { label: t("header.nav.aiAssistant"), href: "#ai-assistant" },
  ];

  useEffect(() => {
    const sectionIds = navLinks.map((l) => l.href.slice(1));
    const observers: IntersectionObserver[] = [];

    const onScroll = () => {
      if (window.scrollY < 80) setActiveHref("");
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && window.scrollY >= 80) setActiveHref(`#${id}`);
        },
        { rootMargin: "-30% 0px -55% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-3 py-3">
      <div className="container mx-auto flex h-16 items-center justify-between rounded-[24px] border border-border/40 bg-white/90 px-3 shadow-sm backdrop-blur-xl transition-all duration-300 md:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3 pr-4 group">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-sm font-bold text-white shadow-md shadow-indigo-200 transition-transform group-hover:scale-105">
            U
          </div>
          <div className="min-w-0">
            <span className="block text-xl font-black tracking-tight text-foreground">UPZ</span>
            <span className="hidden truncate text-[11px] font-medium text-muted-foreground lg:block">Universal Productivity Zone</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-0.5 rounded-2xl p-1 md:flex">
          {navLinks.map((link) => {
            const isActive = activeHref === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="relative rounded-xl px-3 py-2 text-sm font-semibold outline-none"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-xl bg-indigo-50/80 ring-1 ring-indigo-200/60 dark:bg-indigo-500/10 dark:ring-indigo-500/25"
                    transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  />
                )}
                <span
                  className={`relative z-10 transition-colors duration-200 ${
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle compact />
          <LanguageSwitcher />
          {isAuthenticated ? (
            <Button
              className="rounded-2xl border-0 bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-200 hover:from-indigo-600 hover:to-blue-600"
              onClick={() => navigate("/app/home")}
            >
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="rounded-2xl font-semibold"
                data-testid="button-login"
                onClick={() => navigate("/auth/login")}
              >
                {t("header.login")}
              </Button>
              <Button
                className="rounded-2xl border-0 bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-200 hover:from-indigo-600 hover:to-blue-600"
                data-testid="button-get-started"
                onClick={() => navigate("/auth/register")}
              >
                {t("header.getStarted")}
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle compact />
          <LanguageSwitcher />
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl text-foreground transition-colors hover:bg-muted"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            data-testid="button-mobile-menu"
            type="button"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="container mx-auto mt-2 rounded-[24px] border border-border bg-card p-4 shadow-xl md:hidden"
          >
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => {
                const isActive = activeHref === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-2xl px-4 py-3 text-base font-semibold transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                        : "text-foreground hover:bg-muted"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-4 grid gap-2">
              {isAuthenticated ? (
                <Button
                  className="w-full justify-center rounded-2xl border-0 bg-gradient-to-r from-indigo-500 to-blue-500 text-white"
                  onClick={() => { navigate("/app/home"); setMobileMenuOpen(false); }}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              ) : (
                <>
                  <Button variant="outline" className="w-full justify-center rounded-2xl" onClick={() => navigate("/auth/login")}>
                    {t("header.login")}
                  </Button>
                  <Button
                    className="w-full justify-center rounded-2xl border-0 bg-gradient-to-r from-indigo-500 to-blue-500 text-white"
                    onClick={() => navigate("/auth/register")}
                  >
                    {t("header.getStarted")}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
