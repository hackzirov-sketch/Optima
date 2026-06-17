'use client';

import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LANGUAGES, applyDir, I18N_STORAGE_KEY, type LangCode } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LANG_FLAGS: Record<string, string> = {
  en: "🇬🇧",
  uz: "🇺🇿",
  ru: "🇷🇺",
  ar: "🇸🇦",
  tr: "🇹🇷",
};

interface LanguageSwitcherProps {
  variant?: "default" | "toolbar";
}

export function LanguageSwitcher({ variant = "default" }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];
  const isToolbar = variant === "toolbar";

  const handleChange = (code: LangCode) => {
    i18n.changeLanguage(code);
    applyDir(code);
    localStorage.setItem(I18N_STORAGE_KEY, code);
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {isToolbar ? (
          <button
            type="button"
            className="inline-flex h-10 max-w-[9.5rem] items-center gap-2 rounded-xl bg-[var(--upz-nav-accent)] px-3 text-sm font-semibold text-[var(--upz-nav-navy)] transition-all hover:bg-blue-100/80 dark:text-slate-100 dark:hover:bg-slate-800 sm:max-w-none"
            data-testid="button-language-switcher"
          >
            <span className="text-base leading-none">{LANG_FLAGS[currentLang.code]}</span>
            <span className="truncate">{currentLang.label}</span>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
          </button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 font-medium text-muted-foreground hover:text-foreground"
            data-testid="button-language-switcher"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{currentLang.label}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        avoidCollisions
        className={cn(
          "z-[200] min-w-[13rem] overflow-hidden rounded-2xl border border-border/60 bg-popover p-1.5 shadow-xl",
          isToolbar && "w-[13rem]",
        )}
      >
        {/* Header */}
        <div className="px-3 pb-2 pt-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Til tanlash</p>
        </div>

        <div className="h-px bg-border/50 mx-2 mb-1" />

        {LANGUAGES.map((lang) => {
          const isActive = i18n.language === lang.code;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300"
                  : "text-foreground font-medium hover:bg-muted",
              )}
              data-testid={`lang-option-${lang.code}`}
            >
              <span className="text-lg leading-none w-6 text-center">{LANG_FLAGS[lang.code]}</span>
              <span dir={lang.dir === "rtl" ? "rtl" : "ltr"} className="min-w-0 flex-1 truncate">
                {lang.label}
              </span>
              {isActive && (
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
