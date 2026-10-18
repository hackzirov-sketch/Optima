import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n/i18n";
import type { MeetingChatMessage } from "../lib/meetingChat";

export function MeetingChat({ messages, connected, selfId, nameFor, open, onOpen, onSend, showToggle = true, onUnreadChange, disabledReason }: {
  messages: MeetingChatMessage[]; connected: number; selfId: string; nameFor: (id: string) => string;
  open: boolean; onOpen: (open: boolean) => void; onSend: (text: string) => number | Promise<number>;
  /** False when the host page renders its own chat button (Meet's bottom-right toolbar). */
  showToggle?: boolean;
  onUnreadChange?: (count: number) => void;
  /** Set when the host has turned chat off for participants. */
  disabledReason?: string;
}) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const [notice, setNotice] = useState<MeetingChatMessage | null>(null);
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);
  const pending = useRef(false);
  const lastId = useRef<string | undefined>(undefined);
  const list = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.id === lastId.current) return;
    lastId.current = last.id;
    if (!open && last.senderId !== selfId) { setUnread(n => n + 1); setNotice(last); }
    if (open && (nearBottom.current || last.senderId === selfId)) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages, open, selfId]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (open) { setUnread(0); setNotice(null); nearBottom.current = true; list.current?.scrollTo({ top: list.current.scrollHeight }); }
  }, [open]);
  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);
  const time = (value: number) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(value);
  async function submit() {
    if (disabledReason || pending.current || !draft.trim()) return;
    const sentDraft = draft;
    pending.current = true;
    setSending(true);
    try {
      const sent = await onSend(sentDraft);
      if (sent) setDraft(current => current === sentDraft ? "" : current);
      setError(!sent);
    } catch { setError(true); }
    finally { pending.current = false; setSending(false); }
  }
  return <>
    {showToggle && <button className={`meeting-chat-toggle ${open ? "active" : ""}`} title={t("meetingRoom.chatTitle")} aria-label={t("meetingRoom.chatTitle")} aria-expanded={open} onClick={() => onOpen(!open)}><MessageCircle size={22} />{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</button>}
    {notice && !open && <div className="meeting-chat-notice" role="status"><button onClick={() => onOpen(true)}><MessageCircle size={20} /><span><strong>{nameFor(notice.senderId)}</strong><span>{notice.text}</span></span></button><button aria-label={t("common.close")} onClick={() => setNotice(null)}><X size={18} /></button></div>}
    {open && <section className="meeting-chat-panel" aria-label={t("meetingRoom.chatTitle")}>
      <header><div><strong>{t("meetingRoom.chatTitle")}</strong><small>{t("meetingRoom.chatAudience", { count: connected })}</small></div><button aria-label={t("meetingRoom.closePanelAria")} onClick={() => onOpen(false)}><X size={20} /></button></header>
      <p className="meeting-chat-hint">{t("meetingRoom.chatSessionHint")}</p>
      <div className="meeting-chat-list" ref={list} onScroll={event => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; }}>
        {!messages.length && <div className="meeting-chat-empty"><MessageCircle size={32} /><strong>{t("meetingRoom.chatEmpty")}</strong></div>}
        {messages.map(message => <article key={`${message.senderId}:${message.id}`} className={message.senderId === selfId ? "is-self" : ""}><div><strong>{nameFor(message.senderId)}</strong><time>{time(message.time)}</time></div><p>{message.text}</p></article>)}
      </div>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        {disabledReason ? <small role="status">{disabledReason}</small> : error && <small role="alert">{t("meetingRoom.chatSendFailed")}</small>}
        <div><textarea rows={1} maxLength={2000} value={draft} disabled={Boolean(disabledReason)} onChange={event => setDraft(event.target.value)} placeholder={t("chat.messagePlaceholder")} aria-label={t("chat.messageTextAria")} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" disabled={sending || !draft.trim() || Boolean(disabledReason)} aria-busy={sending || undefined} title={t("chat.sendMessageAria")} aria-label={t("chat.sendMessageAria")}><Send size={19} /></button></div>
      </form>
    </section>}
  </>;
}
