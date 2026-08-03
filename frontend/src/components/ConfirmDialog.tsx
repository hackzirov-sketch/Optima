import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import { useI18n } from "../lib/i18n/i18n";

export interface ConfirmOptions {
  title: string;
  /** Body copy — the consequence, spelled out. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red; use it for anything destructive. */
  tone?: "danger" | "default";
}

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Replaces window.confirm(), which renders unstyled browser chrome (and, worse,
 * offers "don't allow this site to prompt you again" — one click and the user
 * can no longer confirm anything in the app).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setClosing(false);
    setPending({ ...options, resolve });
  }), []);

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    current.resolve(value);
    // Let the exit animation play out before unmounting.
    setClosing(true);
    window.setTimeout(() => {
      setPending(null);
      setClosing(false);
    }, 140);
  }, []);

  useEffect(() => {
    if (!pending || closing) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialogRef.current;
    window.requestAnimationFrame(() => node?.querySelector<HTMLButtonElement>("[data-confirm-default]")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        settle(false);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>("button:not([disabled])"));
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
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocus?.focus();
    };
  }, [pending, closing, settle]);

  const value = useMemo(() => confirm, [confirm]);
  const danger = pending?.tone !== "default";

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div className={`confirm-layer ${closing ? "confirm-closing" : ""}`} role="presentation"
             onMouseDown={(event) => event.target === event.currentTarget && settle(false)}>
          <div ref={dialogRef} className={`confirm-dialog ${danger ? "confirm-danger" : ""}`} role="alertdialog"
               aria-modal="true" aria-label={pending.title}>
            <span className="confirm-icon" aria-hidden="true">
              {danger ? <TriangleAlert size={22} /> : <ShieldAlert size={22} />}
            </span>
            <h2>{pending.title}</h2>
            {pending.description && <p>{pending.description}</p>}
            <div className="confirm-actions">
              <button className="button button-ghost" onClick={() => settle(false)}>
                {pending.cancelLabel || t("common.cancel")}
              </button>
              <button data-confirm-default className={`button ${danger ? "button-danger" : "button-primary"}`}
                      onClick={() => settle(true)}>
                {pending.confirmLabel || t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** `const confirm = useConfirm(); if (!(await confirm({ title: … }))) return;` */
export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used inside ConfirmProvider");
  return value;
}
