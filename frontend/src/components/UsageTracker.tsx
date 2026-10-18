import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { recordUsage, type UsageService } from "../lib/usage";
export function UsageTracker() {
  const [path] = useLocation();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const service: UsageService | null = /^\/(meetings|meet)(?:\/|$)/.test(path) ? "meetings" : /^\/(chat|u|g|ch)(\/|$)/.test(path) ? "chat" : path.startsWith("/library") ? "library" : path.startsWith("/education") ? "education" : null;
    if (!service) return;
    recordUsage(user.id, service, 0, 1);
    let last = performance.now();
    let active = Date.now();
    const touch = () => { active = Date.now(); };
    const tick = () => { const now = performance.now(); const seconds = Math.min(15, (now - last) / 1000); last = now; if (document.visibilityState === "visible" && document.hasFocus() && Date.now() - active < 120000) recordUsage(user.id, service, seconds); };
    const visibility = () => { last = performance.now(); };
    window.addEventListener("pointerdown", touch); window.addEventListener("keydown", touch); window.addEventListener("scroll", touch, true); document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(tick, 10000);
    return () => { tick(); clearInterval(timer); window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); window.removeEventListener("scroll", touch, true); document.removeEventListener("visibilitychange", visibility); };
  }, [path, user?.id]);
  return null;
}
