import { useEffect, useState } from "react";

/**
 * The person whose profile card is open (username or public id), Telegram
 * style: a modal over whatever page you are on rather than a page of its own.
 * One instance is mounted in App; anything can open it.
 */
let current: string | null = null;
const listeners = new Set<(value: string | null) => void>();

export function openProfile(identifier: string | number | null | undefined) {
  if (identifier === null || identifier === undefined || identifier === "") return;
  current = String(identifier).replace(/^@/, "");
  listeners.forEach((fn) => fn(current));
}

export function closeProfile() {
  current = null;
  listeners.forEach((fn) => fn(null));
}

export function useOpenProfile(): string | null {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}
