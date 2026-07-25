import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import uz from "./locales/uz.json";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import tr from "./locales/tr.json";

export type Locale = "uz" | "ru" | "en" | "tr";

export const locales: Locale[] = ["uz", "ru", "en", "tr"];

export const localeMeta: Record<Locale, { label: string; short: string }> = {
  uz: { label: "O‘zbekcha", short: "UZ" },
  ru: { label: "Русский", short: "RU" },
  en: { label: "English", short: "EN" },
  tr: { label: "Türkçe", short: "TR" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dictionary = Record<string, any>;

const dictionaries: Record<Locale, Dictionary> = { uz, ru, en, tr };

const STORAGE_KEY = "optima-language";

function readPath(dict: Dictionary, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in (node as Dictionary)) return (node as Dictionary)[key];
    return undefined;
  }, dict);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "uz";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved && (locales as string[]).includes(saved)) return saved as Locale;
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  return (locales as string[]).includes(browser) ? (browser as Locale) : "uz";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  };

  const t = useMemo<TranslateFn>(() => {
    return (key, vars) => {
      const primary = readPath(dictionaries[locale], key);
      if (typeof primary === "string") return interpolate(primary, vars);
      const fallback = readPath(dictionaries.uz, key);
      if (typeof fallback === "string") return interpolate(fallback, vars);
      return key;
    };
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}