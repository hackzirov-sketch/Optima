import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import uz from "./locales/uz.json";
import ru from "./locales/ru.json";
import ar from "./locales/ar.json";
import tr from "./locales/tr.json";

export const LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "uz", label: "O'zbek", dir: "ltr" },
  { code: "ru", label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", dir: "ltr" },
  { code: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629", dir: "rtl" },
  { code: "tr", label: "T\u00fcrk\u00e7e", dir: "ltr" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, uz: { translation: uz }, ru: { translation: ru }, ar: { translation: ar }, tr: { translation: tr } },
    fallbackLng: "en",
    supportedLngs: ["en", "uz", "ru", "ar", "tr"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

export function applyDir(lang: string) {
  const found = LANGUAGES.find((l) => l.code === lang);
  const dir = found?.dir ?? "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", lang);
  if (lang === "ar") {
    document.documentElement.style.setProperty("--app-font-sans", "'Noto Sans Arabic', sans-serif");
  } else {
    document.documentElement.style.setProperty("--app-font-sans", "'Inter', 'Noto Sans Arabic', sans-serif");
  }
}

export default i18n;
