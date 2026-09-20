import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle, X } from "lucide-react";
import { useI18n } from "../lib/i18n/i18n";
import { AnimatedEmoji } from "./AnimatedEmoji";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Optima">
      <img className="brand-mark" src="/optima-logo.png" alt="" aria-hidden="true" />
      {!compact && <span>Optima</span>}
    </div>
  );
}

export function Avatar({ firstName, lastName, url, size = "md" }: { firstName?: string | null; lastName?: string | null; url?: string | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const initials = `${firstName?.[0] || "O"}${lastName?.[0] || ""}`.toUpperCase();
  let resolvedUrl = url;
  if (url && typeof window !== "undefined") {
    try {
      const parsed = new URL(url, window.location.origin);
      if (["localhost", "127.0.0.1"].includes(parsed.hostname) && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
        resolvedUrl = `${window.location.origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      resolvedUrl = url;
    }
  }
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {resolvedUrl ? <img src={resolvedUrl} alt="" /> : initials}
    </span>
  );
}

export function DisplayName({ firstName, lastName, nickname, nameEmoji, className = "" }: {
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
  nameEmoji?: string | null;
  className?: string;
}) {
  return <span className={`display-name ${className}`}>
    {nameEmoji && <AnimatedEmoji id={nameEmoji} className="display-name-emoji" label="" />}
    <span>{nickname?.trim() || `${firstName || ""} ${lastName || ""}`.trim()}</span>
  </span>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: ReactNode;
}

export function Button({ loading, variant = "primary", icon, children, className = "", disabled, ...props }: ButtonProps) {
  return (
    <button className={`button button-${variant} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <LoaderCircle className="spin" size={17} /> : icon}
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Modal({ open, title, description, onClose, children, width = "sm", className = "" }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; width?: "sm" | "md" | "lg"; className?: string }) {
  const { t } = useI18n();
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    const initialFocus = modal?.querySelector<HTMLElement>("[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled])") || modal?.querySelector<HTMLElement>("button:not([disabled])");
    window.requestAnimationFrame(() => initialFocus?.focus());
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      previousFocus?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section ref={modalRef} className={`modal modal-${width} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t("common.closeWindow")}><X size={19} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}
