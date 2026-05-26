import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export const DESIGN_TOKENS = {
  background: "#F7FAFC",
  card: "#FFFFFF",
  border: "#E5E7EB",
  text: "#111827",
  muted: "#6B7280",
  indigo: "#6366F1",
  blue: "#3B82F6",
  shadow: "0 18px 45px rgba(17, 24, 39, 0.08)",
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

interface PageShellProps {
  children: ReactNode;
  className?: string;
}

export function PageShell({ children, className }: PageShellProps) {
  return <div className={cn("mx-auto w-full max-w-7xl space-y-6 pb-8", className)}>{children}</div>;
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, children }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-col gap-4 overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-400" />
      <div className="max-w-3xl">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">{eyebrow}</p>}
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#111827] md:text-3xl">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B7280]">{description}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </motion.div>
  );
}

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function SurfaceCard({ children, className, delay = 0 }: SurfaceCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay }}
      className={cn("rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-sm", className)}
    >
      {children}
    </motion.section>
  );
}

interface SectionTitleProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionTitle({ icon: Icon, title, description, action }: SectionTitleProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
          {description && <p className="mt-1 text-sm text-[#6B7280]">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

interface MetricTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: string;
  trend?: string;
}

export function MetricTile({ label, value, icon: Icon, accent = "#6366F1", trend }: MetricTileProps) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6B7280]">{label}</p>
        <span className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: `${accent}14`, color: accent }}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 text-2xl font-bold text-[#111827]">{value}</div>
      {trend && <div className="mt-2 text-xs font-medium text-emerald-600">{trend}</div>}
    </motion.div>
  );
}

interface PillProps {
  children: ReactNode;
  tone?: "indigo" | "blue" | "green" | "amber" | "red" | "slate";
  className?: string;
}

const pillTone = {
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-rose-50 text-rose-700 ring-rose-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Pill({ children, tone = "indigo", className }: PillProps) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1", pillTone[tone], className)}>{children}</span>;
}

interface ActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  type?: "button" | "submit";
}

const buttonVariant = {
  primary: "bg-indigo-600 text-white shadow-sm shadow-indigo-200 hover:bg-indigo-500",
  secondary: "border border-[#E5E7EB] bg-white text-[#111827] hover:bg-slate-50",
  ghost: "text-[#6B7280] hover:bg-slate-100 hover:text-[#111827]",
  danger: "bg-rose-50 text-rose-700 hover:bg-rose-100",
};

export function ActionButton({ children, onClick, variant = "primary", className, type = "button" }: ActionButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn("inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition-all active:scale-[0.98]", buttonVariant[variant], className)}
    >
      {children}
    </button>
  );
}

interface SimpleTabsProps<T extends string> {
  tabs: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
}

export function SimpleTabs<T extends string>({ tabs, value, onChange, labels }: SimpleTabsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-1 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-semibold capitalize transition-colors",
            value === tab ? "bg-indigo-600 text-white shadow-sm" : "text-[#6B7280] hover:bg-slate-50 hover:text-[#111827]",
          )}
        >
          {labels?.[tab] ?? tab.replace(/-/g, " ")}
        </button>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F7FAFC] p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-[#111827]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B7280]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-100" />
      <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
      <div className="h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
      <div className="grid grid-cols-3 gap-3 pt-2">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  accent?: string;
  label?: string;
}

export function ProgressBar({ value, accent = DESIGN_TOKENS.indigo, label }: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div>
      {label && (
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#6B7280]">
          <span>{label}</span>
          <span>{safeValue}%</span>
        </div>
      )}
      <div className="h-2.5 overflow-hidden rounded-full bg-[#F7FAFC] ring-1 ring-[#E5E7EB]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${safeValue}%`, background: accent }} />
      </div>
    </div>
  );
}

interface CommandCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  meta?: string;
  accent?: string;
  onClick?: () => void;
}

export function CommandCard({ icon: Icon, title, description, meta, accent = DESIGN_TOKENS.indigo, onClick }: CommandCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      className="group flex w-full items-start gap-4 rounded-[24px] border border-[#E5E7EB] bg-white p-4 text-left shadow-sm transition-all hover:border-indigo-100 hover:shadow-md"
    >
      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl" style={{ background: `${accent}14`, color: accent }}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[#111827]">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-[#6B7280]">{description}</span>
        {meta && <span className="mt-3 inline-flex rounded-full bg-[#F7FAFC] px-2.5 py-1 text-xs font-semibold text-[#6B7280] ring-1 ring-[#E5E7EB]">{meta}</span>}
      </span>
    </motion.button>
  );
}

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.99 }}
      className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-semibold text-[#111827] shadow-2xl"
    >
      {message}
    </motion.div>
  );
}

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, description, children, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#111827]/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#111827]">{title}</h3>
            {description && <p className="mt-1 text-sm text-[#6B7280]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl px-2 py-1 text-[#6B7280] hover:bg-slate-100" aria-label="Close modal">
            x
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </motion.div>
    </div>
  );
}
