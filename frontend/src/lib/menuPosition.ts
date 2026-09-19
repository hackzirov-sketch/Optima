type Rectangle = { left: number; right: number; top: number; bottom: number };

export function menuPosition(anchor: Rectangle, menu: { width: number; height: number }, viewport: { width: number; height: number; left?: number; top?: number }) {
  const margin = 12;
  const left = viewport.left ?? 0;
  const top = viewport.top ?? 0;
  const maxX = Math.max(left + margin, left + viewport.width - menu.width - margin);
  const maxY = Math.max(top + margin, top + viewport.height - menu.height - margin);
  const below = anchor.bottom + 6;
  return {
    left: Math.min(maxX, Math.max(left + margin, anchor.right - menu.width)),
    top: Math.min(maxY, Math.max(top + margin, below + menu.height <= top + viewport.height - margin ? below : anchor.top - menu.height - 6)),
  };
}
