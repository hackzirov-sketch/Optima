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
            className="inline-flex h-10 max-w-[9.5rem] items-center gap-1.5 rounded-xl bg-[var(--upz-nav-accent)] px-2.5 text-sm font-medium text-[var(--upz-nav-navy)] transition-colors hover:bg-blue-100/80 dark:text-slate-100 dark:hover:bg-slate-800 sm:max-w-none sm:gap-2 sm:px-3"
            data-testid="button-language-switcher"
          >
            <Globe className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
            <span className="truncate">{currentLang.label}</span>
            <ChevronDown className="hidden h-3.5 w-3.5 flex-shrink-0 opacity-60 sm:block" />
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
        sideOffset={10}
        collisionPadding={16}
        avoidCollisions
        className={cn(
          "z-[200] min-w-[11rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white px-[5px] py-[5px] shadow-lg dark:border-slate-700 dark:bg-slate-900",
          isToolbar && "w-[11.5rem]",
        )}
      >
        {LANGUAGES.map((lang) => {
          const isActive = i18n.language === lang.code;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none",
                isActive
                  ? "bg-[var(--upz-nav-accent)] text-[var(--upz-nav-navy)] focus:bg-[var(--upz-nav-accent)] dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-700 focus:bg-slate-50 dark:text-slate-200 dark:focus:bg-slate-800",
              )}
              data-testid={`lang-option-${lang.code}`}
            >
              <span dir={lang.dir === "rtl" ? "rtl" : "ltr"} className="min-w-0 flex-1 truncate">
                {lang.label}
              </span>
              {isActive && (
                <Check className="h-4 w-4 flex-shrink-0 text-[var(--upz-nav-brand)] dark:text-blue-400" strokeWidth={2.5} />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
