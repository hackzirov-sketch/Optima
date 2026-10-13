/**
 * Phones: marks <html> with `keyboard-open` while the on-screen keyboard is
 * up (the visual viewport shrinks well below the layout viewport), so the
 * bottom navigation can step aside instead of sitting on top of the keyboard.
 */
export function installKeyboardClass() {
  const viewport = typeof window !== "undefined" ? window.visualViewport : null;
  if (!viewport) return;
  const update = () => {
    const typing = document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, [contenteditable='true'], [contenteditable='']");
    const open = typing && window.innerHeight - viewport.height > 150;
    document.documentElement.classList.toggle("keyboard-open", open);
  };
  viewport.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", () => window.setTimeout(update, 50));
}
