import { type CSSProperties, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Dismissal every floating surface in Meet shares: a press outside it (but
 * not on the button that opened it — that button toggles) or Escape closes
 * it, and keyboard focus goes back to that button so the user isn't left
 * stranded at the top of the document.
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  surfaceRef: RefObject<HTMLElement | null>,
  triggerRef?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (surfaceRef.current?.contains(target) || triggerRef?.current?.contains(target));
    const onPointer = (event: PointerEvent) => {
      if (!inside(event.target)) close.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The innermost open surface wins; one Escape closes one layer.
      // defaultPrevented tells outer layers (side panels listen on window)
      // that this Escape has been used.
      if (event.defaultPrevented) return;
      event.preventDefault();
      close.current();
      triggerRef?.current?.focus();
    };
    // Capture phase, so a click that lands on something which stops
    // propagation (a video tile, the chat list) still counts as "outside".
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, surfaceRef, triggerRef]);
}

export interface MeetMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Hidden on wide screens: entries that live in the toolbar there. */
  mobileOnly?: boolean;
  checked?: boolean;
}

/**
 * A menu anchored to the button that opens it (WAI-ARIA menu button):
 * Arrow keys / Home / End move between items, Enter/Space activate, Escape
 * or a click outside closes, and focus returns to the trigger.
 */
export function MeetMenu({ open, onClose, triggerRef, items, placement = "top", align = "start", label, className = "" }: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  items: MeetMenuItem[];
  placement?: "top" | "bottom";
  align?: "start" | "end" | "center";
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, ref, triggerRef);
  const [visible, setVisible] = useState<MeetMenuItem[]>(items);
  const [position, setPosition] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      const menu = ref.current;
      if (!trigger || !menu) return;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
      let bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
      const dock = document.querySelector(".mobile-nav");
      const dockRect = dock?.getBoundingClientRect();
      if (dockRect && dockRect.height > 0) bottomEdge = Math.min(bottomEdge, dockRect.top - 8);
      const anchor = trigger.getBoundingClientRect();
      const width = Math.min(menu.offsetWidth, rightEdge - leftEdge);
      const height = Math.min(menu.scrollHeight, bottomEdge - topEdge);
      const below = bottomEdge - anchor.bottom - 6;
      const above = anchor.top - topEdge - 6;
      const useTop = placement === "top" ? above >= height || above > below : below < height && above > below;
      const desiredTop = useTop ? anchor.top - height - 6 : anchor.bottom + 6;
      const desiredLeft = align === "end" ? anchor.right - width : align === "center" ? anchor.left + (anchor.width - width) / 2 : anchor.left;
      setPosition({
        position: "fixed", zIndex: 1500, left: Math.max(leftEdge, Math.min(desiredLeft, rightEdge - width)),
        top: Math.max(topEdge, Math.min(desiredTop, bottomEdge - height)),
        right: "auto", bottom: "auto", translate: "none",
        maxWidth: rightEdge - leftEdge, maxHeight: Math.max(44, bottomEdge - topEdge), overflowY: "auto",
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open, visible, placement, align, triggerRef]);

  // The visible subset depends on the viewport (mobileOnly items).
  useLayoutEffect(() => {
    if (!open) return;
    const narrow = window.matchMedia("(max-width: 720px)").matches;
    setVisible(items.filter((item) => !item.mobileOnly || narrow));
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    // First enabled item, so keyboard users land inside the menu.
    const frame = window.requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const move = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const go = (next: number) => { event.preventDefault(); buttons[(next + buttons.length) % buttons.length].focus(); };
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(buttons.length - 1);
    else if (event.key === "Tab") onClose();
  }, [onClose]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} style={position} role="menu" aria-label={label} className={`meet-menu meet-menu-${placement} meet-menu-${align} ${className}`} onKeyDown={move}>
      {visible.map((item) => (
        <button
          key={item.key}
          type="button"
          role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={item.checked}
          className={item.danger ? "danger" : ""}
          disabled={item.disabled}
          onClick={() => { onClose(); item.onSelect(); }}
        >
          {item.icon && <span className="meet-menu-icon" aria-hidden="true">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>, document.fullscreenElement ?? document.body
  );
}

/** A non-menu popover (emoji bar, device pickers) with the same dismissal rules. */
export function MeetPopover({ open, onClose, triggerRef, children, placement = "top", align = "center", label, className = "" }: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  placement?: "top" | "bottom";
  align?: "start" | "end" | "center";
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, ref, triggerRef);
  useEffect(() => {
    if (open) window.requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("button, select, input")?.focus());
  }, [open]);
  if (!open) return null;
  return <div ref={ref} role="dialog" aria-label={label} className={`meet-popover meet-menu-${placement} meet-menu-${align} ${className}`}>{children}</div>;
}
