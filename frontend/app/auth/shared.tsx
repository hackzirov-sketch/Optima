'use client';

import { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

export function AuthField({
  icon, label, value, onChange, placeholder, type = "text", autoComplete, action,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  action?: ReactNode;
}) {
  return (
    <label className="group block">
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </span>
      <span className="flex h-12 items-center gap-3 rounded-2xl border border-border bg-muted px-4 shadow-sm transition-all
        group-focus-within:border-indigo-400 group-focus-within:bg-card group-focus-within:ring-4 group-focus-within:ring-indigo-100
        dark:bg-slate-900 dark:border-slate-700
        dark:group-focus-within:border-indigo-400 dark:group-focus-within:bg-slate-950 dark:group-focus-within:ring-indigo-500/20">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none
            placeholder:text-slate-400 dark:placeholder:text-slate-600"
        />
        {action}
      </span>
    </label>
  );
}

export function ProviderButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[5rem] flex-col items-center justify-center gap-2 rounded-[22px] border border-border bg-card p-3
        text-xs font-bold text-slate-500 shadow-sm transition-all
        hover:-translate-y-0.5 hover:border-indigo-300 hover:text-foreground hover:shadow-md
        dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400
        dark:hover:border-indigo-500 dark:hover:text-white"
    >
      <span className="text-foreground dark:text-slate-200">{icon}</span>
      {label}
    </button>
  );
}

export function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-slate-400 transition-colors hover:text-foreground dark:hover:text-slate-200"
      aria-label="Toggle password visibility"
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

export function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative z-10 flex-1 rounded-[18px] px-4 py-3 text-sm font-black transition-all ${
        active
          ? "text-foreground dark:text-white"
          : "text-slate-500 hover:text-foreground dark:text-slate-400 dark:hover:text-white"
      }`}
    >
      {active && (
        <motion.div
          layoutId="tab-bg"
          className="absolute inset-0 z-[-1] rounded-[18px] bg-card shadow-sm dark:bg-slate-800"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      {children}
    </button>
  );
}

export function PrimaryButton({
  onClick, disabled, children, fullWidth = true,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl
        bg-gradient-to-r from-indigo-500 to-blue-500 px-6
        text-sm font-black text-white shadow-lg shadow-indigo-200/60
        transition-all hover:from-indigo-600 hover:to-blue-600
        disabled:cursor-not-allowed disabled:opacity-40
        dark:shadow-indigo-950/40
        ${fullWidth ? "w-full" : ""}`}
    >
      {children}
    </motion.button>
  );
}
