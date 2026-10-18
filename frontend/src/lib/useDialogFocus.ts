import { useEffect, useRef, type RefObject } from "react";

export function useDialogFocus(open: boolean, modalRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    const frame = window.requestAnimationFrame(() => {
      (modal?.querySelector<HTMLElement>("[autofocus]") || modal)?.focus({ preventScroll: true });
    });
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
      }
      if (event.key !== "Tab" || !modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"))
        .filter((node) => !node.closest("[hidden], [inert], [aria-hidden='true']") && getComputedStyle(node).display !== "none" && getComputedStyle(node).visibility !== "hidden");
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); modal.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal || !modal.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handler, true);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, modalRef]);
}
