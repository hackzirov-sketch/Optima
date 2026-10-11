import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, LoaderCircle, Sparkles, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { StarfieldBackground } from "../components/StarfieldBackground";

type Message = { role: "user" | "model"; text: string; image?: string; sources?: Array<{ title: string; url: string }> };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TEXTAREA_MAX = 160;

export function AiPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const follow = useRef(true);
  useEffect(() => { if (follow.current) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "auto" }); }, [messages, busy]);

  // The field grows with what's typed (no inner scrollbar for a line or two); past ~6 lines it scrolls.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, TEXTAREA_MAX)}px`;
    node.style.overflowY = node.scrollHeight > TEXTAREA_MAX ? "auto" : "hidden";
  }, [draft]);

  function attach(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError(t("chat.aiImageOnly")); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError(t("chat.aiImageTooLarge")); return; }
    setError("");
    setImage((current) => { if (current) URL.revokeObjectURL(current.url); return { file, url: URL.createObjectURL(file) }; });
  }

  async function send() {
    const prompt = draft.trim();
    if ((!prompt && !image) || busy) return;
    const history = messages.slice(-30).map(({ role, text }) => ({ role, text }));
    const sentImage = image;
    follow.current = true;
    setMessages(current => [...current, { role: "user", text: prompt, image: sentImage?.url }]);
    setDraft(""); setImage(null); setBusy(true); setError("");
    try {
      const result = sentImage ? await api.chat.aiImage(sentImage.file, prompt, history) : await api.chat.ai(prompt, history);
      setMessages(current => [...current, { role: "model", text: result.reply, sources: result.sources }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("chat.aiNotResponding"));
      setDraft(prompt);
      if (sentImage) setImage(sentImage);
    } finally { setBusy(false); }
  }

  return <section className="standalone-ai" aria-label="Optima AI">
    <StarfieldBackground />
    <header><Sparkles size={24} /><div><h1>Optima AI</h1><p>{t("chat.aiOnlineAssistant")}</p></div></header>
    <div ref={list} className="standalone-ai-messages" onScroll={() => { const node = list.current; if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; }}>
      {!messages.length && <div className="standalone-ai-empty"><Sparkles size={40} /><h2>Optima AI</h2><p>{t("chat.aiEmptyDesc")}</p></div>}
      {messages.map((message, index) => <article key={index} className={`standalone-ai-message ${message.role}`}><small>{message.role === "model" ? "Optima AI" : user?.firstName}</small>{message.image && <img className="standalone-ai-image" src={message.image} alt="" />}{message.text && <p>{message.text}</p>}{message.sources?.map(source => /^https?:\/\//i.test(source.url) && <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</article>)}
      {busy && <div role="status" className="standalone-ai-status"><LoaderCircle className="spin" size={18} />{t("chat.aiThinkingStatus")}</div>}
    </div>
    {error && <p role="alert" className="standalone-ai-error">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      {image && <span className="standalone-ai-attachment"><img src={image.url} alt="" /><button type="button" onClick={() => { URL.revokeObjectURL(image.url); setImage(null); }} aria-label={t("chat.aiRemoveImage")}><X size={14} /></button></span>}
      <button type="button" className="standalone-ai-attach" onClick={() => picker.current?.click()} disabled={busy} aria-label={t("chat.aiAttachImage")} title={t("chat.aiAttachImage")}><ImagePlus size={20} /></button>
      <input ref={picker} type="file" accept="image/*" hidden onChange={event => { attach(event.target.files?.[0]); event.target.value = ""; }} />
      <textarea ref={field} value={draft} onChange={event => setDraft(event.target.value)} aria-label={t("chat.sendQuestionAria")} placeholder={t("chat.aiComposerPlaceholder")} rows={1}
        onPaste={event => { const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/")); if (file) { event.preventDefault(); attach(file); } }}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <button disabled={busy || (!draft.trim() && !image)} aria-label={t("chat.sendQuestionAria")}><ArrowUp size={20} /></button>
    </form>
  </section>;
}
