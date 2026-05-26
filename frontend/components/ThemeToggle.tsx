import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/utils/theme";

interface ThemeToggleProps {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? t("app.theme.switchToLight") : t("app.theme.switchToDark");

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="group inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white/80 px-2.5 text-sm font-semibold text-[#6B7280] shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:text-[#111827] dark:border-slate-700/80 dark:bg-slate-900/75 dark:text-slate-300 dark:hover:border-indigo-400/40 dark:hover:bg-slate-800 dark:hover:text-white"
      data-testid="button-theme-toggle"
    >
      <span className="relative grid h-6 w-6 place-items-center rounded-xl bg-[#F7FAFC] text-indigo-600 transition-colors dark:bg-slate-800 dark:text-amber-300">
        {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      </span>
      {!compact && (
        <span className="hidden sm:inline">
          {isDark ? t("app.theme.dark") : t("app.theme.light")}
        </span>
      )}
    </button>
  );
}
