'use client';

import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "upz_theme";

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === "dark" || saved === "light" ? saved : getSystemTheme();
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function setStoredTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent<ThemeMode>("upz-theme-change", { detail: theme }));
}

export function initializeTheme() {
  applyTheme(getStoredTheme());
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);

    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail;
      if (nextTheme === "light" || nextTheme === "dark") {
        setTheme(nextTheme);
      }
    };

    window.addEventListener("upz-theme-change", handleThemeChange);
    return () => window.removeEventListener("upz-theme-change", handleThemeChange);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    setStoredTheme(nextTheme);
  };

  return { theme, isDark: theme === "dark", toggleTheme };
}
