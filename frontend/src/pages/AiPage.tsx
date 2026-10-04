import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { StarfieldBackground } from "../components/StarfieldBackground";

type Message = { role: "user" | "model"; text: string; sources?: Array<{ title: string; url: string }> };

export function AiPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { if (follow.current) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "auto" }); }, [messages, busy]);
  async function send() {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    const history = messages.slice(-30).map(({ role, text }) => ({ role, text }));
    follow.current = true;
    setMessages(current => [...current, { role: "user", text: prompt }]);
    setDraft(""); setBusy(true); setError("");
    try {
      const result = await api.chat.ai(prompt, history);
      setMessages(current => [...current, { role: "model", text: result.reply, sources: result.sources }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("chat.aiNotResponding")); setDraft(prompt); }
    finally { setBusy(false); }
  }
  return <section className="standalone-ai" aria-label="Optima AI">
    <StarfieldBackground />
    <header><Sparkles size={24} /><div><h1>Optima AI</h1><p>{t("chat.aiOnlineAssistant")}</p></div></header>
    <div ref={list} className="standalone-ai-messages" onScroll={() => { const node = list.current; if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; }}>
      {!messages.length && <div className="standalone-ai-empty"><Sparkles size={40} /><h2>Optima AI</h2><p>{t("chat.aiEmptyDesc")}</p></div>}
      {messages.map((message, index) => <article key={index} className={`standalone-ai-message ${message.role}`}><small>{message.role === "model" ? "Optima AI" : user?.firstName}</small><p>{message.text}</p>{message.sources?.map(source => /^https?:\/\//i.test(source.url) && <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</article>)}
      {busy && <div role="status" className="standalone-ai-status"><LoaderCircle className="spin" size={18} />{t("chat.aiThinkingStatus")}</div>}
    </div>
    {error && <p role="alert" className="standalone-ai-error">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); void send(); }}><textarea value={draft} onChange={event => setDraft(event.target.value)} aria-label={t("chat.sendQuestionAria")} placeholder={t("chat.aiEmptyDesc")} rows={2} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><button disabled={busy || !draft.trim()} aria-label={t("chat.sendQuestionAria")}><ArrowUp size={20} /></button></form>
  </section>;
}
