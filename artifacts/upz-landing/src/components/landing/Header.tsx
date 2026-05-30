import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: t("header.nav.features"), href: "#features" },
    { label: t("header.nav.howItWorks"), href: "#how-it-works" },
    { label: t("header.nav.forWhom"), href: "#for-whom" },
    { label: t("header.nav.aiAssistant"), href: "#ai-assistant" },
  ];

  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-3 py-3">
      <div
        className={`container mx-auto flex h-16 items-center justify-between rounded-[24px] border px-3 transition-all duration-300 md:px-4 ${
          isScrolled
            ? "border-[#E5E7EB] bg-white/90 shadow-lg shadow-slate-200/60 backdrop-blur-xl"
            : "border-white/80 bg-white/70 shadow-sm backdrop-blur-xl"
        }`}
      >
        <Link href="/" className="flex min-w-0 items-center gap-3 pr-4 group">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-sm font-bold text-white shadow-md shadow-indigo-200 transition-transform group-hover:scale-105">
            U
          </div>
          <div className="min-w-0">
            <span className="block text-xl font-black tracking-tight text-[#111827]">Optima</span>
            <span className="hidden truncate text-[11px] font-medium text-[#6B7280] lg:block">Optima</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 rounded-2xl bg-[#F7FAFC] p-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-xl px-3 py-2 text-sm font-semibold text-[#6B7280] transition-colors hover:bg-white hover:text-[#111827]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle compact />
          <LanguageSwitcher />
          <Button
            variant="outline"
            className="rounded-2xl font-semibold"
            data-testid="button-login"
            onClick={() => navigate("/onboarding?mode=signin")}
          >
            {t("header.login")}
          </Button>
          <Button
            className="rounded-2xl border-0 bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-200 hover:from-indigo-600 hover:to-blue-600"
            data-testid="button-get-started"
            onClick={() => navigate("/onboarding?mode=signup")}
          >
            {t("header.getStarted")}
          </Button>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle compact />
          <LanguageSwitcher />
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl text-[#111827] transition-colors hover:bg-[#F7FAFC]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            data-testid="button-mobile-menu"
            type="button"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="container mx-auto mt-2 rounded-[24px] border border-[#E5E7EB] bg-white p-4 shadow-xl md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-2xl px-4 py-3 text-base font-semibold text-[#111827] transition-colors hover:bg-[#F7FAFC]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 grid gap-2">
            <Button variant="outline" className="w-full justify-center rounded-2xl" onClick={() => navigate("/onboarding?mode=signin")}>
              {t("header.login")}
            </Button>
            <Button
              className="w-full justify-center rounded-2xl border-0 bg-gradient-to-r from-indigo-500 to-blue-500 text-white"
              onClick={() => navigate("/onboarding?mode=signup")}
            >
              {t("header.getStarted")}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
