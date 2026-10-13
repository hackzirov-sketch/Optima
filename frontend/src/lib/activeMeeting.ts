import { useEffect, useState } from "react";

/**
 * The meeting this tab is in right now (null when none). One meeting at a
 * time: other meetings' Join buttons and links are refused while it is set.
 */
export interface ActiveMeeting { id: string; code?: string | null; title?: string | null }
let current: ActiveMeeting | null = null;
const listeners = new Set<(value: ActiveMeeting | null) => void>();

export function setActiveMeeting(value: ActiveMeeting | null) {
  if (current?.id === value?.id && current?.code === value?.code) return;
  current = value;
  listeners.forEach((fn) => fn(current));
}

export function getActiveMeeting() {
  return current;
}

export function useActiveMeeting(): ActiveMeeting | null {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    setValue(current);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}
