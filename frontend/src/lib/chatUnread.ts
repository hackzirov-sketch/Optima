import { useEffect, useState } from "react";

// ChatPage stays mounted at the app root (see App.tsx) so it always knows
// the true unread total, but the dock icon lives in AppShell, a separate
// component with no props path between them. This tiny external store
// bridges the two without pulling in a state library for one number.
let total = 0;
const listeners = new Set<(value: number) => void>();

export function setUnreadTotal(value: number) {
  if (value === total) return;
  total = value;
  listeners.forEach((listener) => listener(value));
}

export function useUnreadTotal() {
  const [value, setValue] = useState(total);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
