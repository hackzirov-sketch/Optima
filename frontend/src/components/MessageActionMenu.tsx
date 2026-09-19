import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { menuPosition } from "../lib/menuPosition";

export function MessageActionMenu({ anchor, label, onClose, children }: {
  anchor: HTMLElement | null;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu || !anchor) return;
    const viewport = window.visualViewport;
    const update = () => {
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      menu.style.maxHeight = `${Math.max(80, height - 24)}px`;
      menu.style.width = `${Math.min(288, width - 24)}px`;
      const point = menuPosition(anchor.getBoundingClientRect(), { width: menu.offsetWidth, height: menu.offsetHeight }, { width, height, left: viewport?.offsetLeft, top: viewport?.offsetTop });
      menu.style.left = `${point.left}px`;
      menu.style.top = `${point.top}px`;
    };
    update();
    const buttons = () => Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    menu.querySelector<HTMLButtonElement>(":scope > button:not(:disabled)")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const items = buttons();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[index]?.focus();
    };
    const outsideScroll = (event: Event) => {
      if (event.target instanceof Node && menu.contains(event.target)) return;
      closeRef.current();
    };
    document.addEventListener("keydown", handleKey, true);
    document.addEventListener("scroll", outsideScroll, true);
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("scroll", outsideScroll, true);
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);

  return createPortal(<>
    <div className="message-menu-backdrop" onPointerDown={onClose} aria-hidden="true" />
    <div ref={ref} className="message-context-menu message-action-popover" role="menu" aria-label={label}>{children}</div>
  </>, document.body);
}
