import { LoaderCircle, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n/i18n";
import { openProfile } from "../lib/profileModal";
import { Avatar } from "./ui";

type Reactor = Awaited<ReturnType<typeof api.chat.reactors>>[number];

/**
 * Telegram's "who reacted" list: tabs per emoji (plus All), each row the
 * person, the emoji they picked and when. Anchored at the pointer.
 */
export function ReactorsPopover({ messageId, x, y, renderEmoji, onClose }: {
  messageId: string;
  x: number;
  y: number;
  renderEmoji: (emoji: string) => React.ReactNode;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Reactor[] | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    let cancelled = false;
    api.chat.reactors(messageId).then((rows) => { if (!cancelled) setItems(rows); }).catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [messageId]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // Keep it on screen.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)) });
  }, [x, y, items]);

  const counts = new Map<string, number>();
  items?.forEach((item) => counts.set(item.emoji, (counts.get(item.emoji) ?? 0) + 1));
  const shown = items?.filter((item) => !tab || item.emoji === tab) ?? [];
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return <div ref={ref} className="reactors-popover" role="dialog" aria-label={t("chat.reactionsTitle")} style={pos}>
    <header>
      <div className="reactors-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!tab} className={!tab ? "active" : ""} onClick={() => setTab(null)}>{t("chat.reactionsAll")} {items?.length ?? ""}</button>
        {[...counts.entries()].map(([emoji, count]) => (
          <button key={emoji} type="button" role="tab" aria-selected={tab === emoji} className={tab === emoji ? "active" : ""} onClick={() => setTab(emoji)}>{renderEmoji(emoji)} {count}</button>
        ))}
      </div>
      <button type="button" className="reactors-close" onClick={onClose} aria-label={t("publicProfile.closeAria")}><X size={16} /></button>
    </header>
    {items === null && <div className="reactors-empty"><LoaderCircle className="spin" size={18} /></div>}
    {items?.length === 0 && <div className="reactors-empty">{t("chat.reactionsEmpty")}</div>}
    <ul>
      {shown.map((item) => (
        <li key={item.userId}>
          <button type="button" onClick={() => { onClose(); openProfile(item.userId); }}>
            <Avatar firstName={item.firstName} lastName={item.lastName} url={item.avatarUrl} size="sm" />
            <span><strong>{`${item.firstName} ${item.lastName}`.trim()}</strong><small>{when(item.createdAt)}</small></span>
            <em>{renderEmoji(item.emoji)}</em>
          </button>
        </li>
      ))}
    </ul>
  </div>;
}
