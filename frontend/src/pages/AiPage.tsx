import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Brain, ImageIcon, ImagePlus, LoaderCircle, Menu, MessageSquarePlus, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { StarfieldBackground } from "../components/StarfieldBackground";
import { AiMemoryPanel } from "../components/AiMemoryPanel";

type AiRequest = { id: string; prompt: string; image: { file: File; url: string } | null; history: Array<{ role: "user" | "model"; text: string }> };
type Message = { id?: string; role: "user" | "model"; text: string; image?: string; hasImage?: boolean; failed?: AiRequest; sources?: Array<{ title: string; url: string }> };
type Conversation = { id: string; title: string; updatedAt: string };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TEXTAREA_MAX = 160;

export function AiPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const conversationId = params.id ?? null;
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const follow = useRef(true);
  // The conversation a just-sent first message created: its route change must
  // not reload (and wipe) the messages already on screen.
  const justCreated = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  useEffect(() => () => { requestGeneration.current++; }, [conversationId]);
  useEffect(() => { if (follow.current) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "auto" }); }, [messages, busy]);

  const loadConversations = useCallback(() => {
    api.chat.aiConversations().then(setConversations).catch(() => setConversations((current) => current ?? []));
  }, []);
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // The route says which conversation is open; /ai alone is a fresh one.
  useEffect(() => {
    setError("");
    setBusy(false);
    setDrawer(false);
    if (!conversationId) { setMessages([]); setLoadingConversation(false); return; }
    if (justCreated.current === conversationId) { justCreated.current = null; return; }
    let cancelled = false;
    setLoadingConversation(true);
    setMessages([]);
    api.chat.aiConversation(conversationId)
      .then((result) => { if (!cancelled) { follow.current = true; setMessages(result.messages.map(({ role, text, hasImage, sources }) => ({ role, text, hasImage, sources }))); } })
      .catch(() => { if (!cancelled) navigate("/ai", { replace: true }); })
      .finally(() => { if (!cancelled) setLoadingConversation(false); });
    return () => { cancelled = true; };
  }, [conversationId, navigate]);

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

  async function send(retry?: AiRequest) {
    const prompt = retry ? retry.prompt : draft.trim();
    const sentImage = retry ? retry.image : image;
    if ((!prompt && !sentImage) || busy) return;
    const generation = requestGeneration.current;
    const history = retry?.history ?? messages.filter(message => !message.failed).slice(-30).map(({ role, text }) => ({ role, text }));
    const request: AiRequest = retry ?? { id: crypto.randomUUID(), prompt, image: sentImage, history };
    follow.current = true;
    setMessages(current => retry ? current.map(message => message.id === retry.id ? { ...message, failed: undefined } : message) : [...current, { id: request.id, role: "user", text: prompt, image: sentImage?.url }]);
    if (!retry) { setDraft(""); setImage(null); }
    setBusy(true); setError("");
    try {
      const result = sentImage
        ? await api.chat.aiImage(sentImage.file, prompt, history, conversationId ?? undefined)
        : await api.chat.ai(prompt, history, { conversationId: conversationId ?? undefined });
      if (generation !== requestGeneration.current) return;
      setMessages(current => [...current, { role: "model", text: result.reply, sources: result.sources }]);
      if (result.conversationId) {
        const id = result.conversationId;
        const title = result.title ?? "";
        setConversations((current) => [{ id, title, updatedAt: new Date().toISOString() }, ...(current ?? []).filter((item) => item.id !== id)]);
        if (id !== conversationId) { justCreated.current = id; navigate(`/ai/${id}`, { replace: !conversationId }); }
      }
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      setError(cause instanceof Error ? cause.message : t("chat.aiNotResponding"));
      setMessages(current => current.map(message => message.id === request.id ? { ...message, failed: request } : message));
    } finally { if (generation === requestGeneration.current) setBusy(false); }
  }

  async function saveRename() {
    if (!renaming) return;
    const title = renaming.title.trim();
    setRenaming(null);
    if (!title) return;
    setConversations((current) => current?.map((item) => item.id === renaming.id ? { ...item, title } : item) ?? current);
    await api.chat.renameAiConversation(renaming.id, title).catch(() => loadConversations());
  }

  async function remove(id: string) {
    if (!window.confirm(t("chat.aiDeleteConfirm"))) return;
    setConversations((current) => current?.filter((item) => item.id !== id) ?? current);
    if (id === conversationId) navigate("/ai");
    await api.chat.deleteAiConversation(id).catch(() => loadConversations());
  }

  const startNew = () => { setDrawer(false); navigate("/ai"); window.requestAnimationFrame(() => field.current?.focus()); };
  const today = new Date().toDateString();
  const groups = [
    { label: t("chat.aiToday"), items: (conversations ?? []).filter((item) => new Date(item.updatedAt).toDateString() === today) },
    { label: t("chat.aiEarlier"), items: (conversations ?? []).filter((item) => new Date(item.updatedAt).toDateString() !== today) },
  ].filter((group) => group.items.length > 0);

  return <section className="standalone-ai has-sessions" aria-label="Optima AI">
    <StarfieldBackground />
    {drawer && <div className="ai-sessions-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
    <aside className={`ai-sessions ${drawer ? "open" : ""}`} aria-label={t("chat.aiHistory")}>
      <div className="ai-sessions-top">
        <button type="button" className="ai-new-chat" onClick={startNew}><MessageSquarePlus size={18} />{t("chat.aiNewChat")}</button>
        <button type="button" className="ai-sessions-close" onClick={() => setDrawer(false)} aria-label={t("publicProfile.closeAria")}><X size={18} /></button>
      </div>
      <nav className="ai-sessions-list">
        {conversations === null && <div className="ai-sessions-empty"><LoaderCircle className="spin" size={18} /></div>}
        {conversations?.length === 0 && <p className="ai-sessions-empty">{t("chat.aiNoHistory")}</p>}
        {groups.map((group) => <div key={group.label} className="ai-sessions-group">
          <h3>{group.label}</h3>
          {group.items.map((item) => renaming?.id === item.id
            ? <form key={item.id} className="ai-session-rename" onSubmit={(event) => { event.preventDefault(); void saveRename(); }}>
                <input autoFocus value={renaming.title} maxLength={120} onChange={(event) => setRenaming({ id: item.id, title: event.target.value })} onBlur={() => void saveRename()} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} aria-label={t("chat.aiRename")} />
              </form>
            : <div key={item.id} className={`ai-session ${item.id === conversationId ? "active" : ""}`}>
                <button type="button" className="ai-session-open" onClick={() => navigate(`/ai/${item.id}`)} title={item.title}>{item.title || t("chat.aiNewChat")}</button>
                <span className="ai-session-actions">
                  <button type="button" onClick={() => setRenaming({ id: item.id, title: item.title })} aria-label={t("chat.aiRename")} title={t("chat.aiRename")}><Pencil size={14} /></button>
                  <button type="button" onClick={() => void remove(item.id)} aria-label={t("chat.aiDelete")} title={t("chat.aiDelete")}><Trash2 size={14} /></button>
                </span>
              </div>)}
        </div>)}
      </nav>
      <button type="button" className="ai-memory-open" onClick={() => { setDrawer(false); setMemoryOpen(true); }}><Brain size={17} />{t("chat.aiMemory")}</button>
    </aside>
    {memoryOpen && <AiMemoryPanel onClose={() => setMemoryOpen(false)} />}
    <div className="ai-main">
      <header>
        <button type="button" className="ai-sessions-toggle" onClick={() => setDrawer(true)} aria-label={t("chat.aiOpenHistory")}><Menu size={20} /></button>
        <Sparkles size={24} /><div><h1>Optima AI</h1><p>{t("chat.aiOnlineAssistant")}</p></div>
        <button type="button" className="ai-header-new" onClick={startNew} aria-label={t("chat.aiNewChat")} title={t("chat.aiNewChat")}><MessageSquarePlus size={19} /></button>
      </header>
      <div ref={list} className="standalone-ai-messages" onScroll={() => { const node = list.current; if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; }}>
        {loadingConversation && <div className="standalone-ai-status"><LoaderCircle className="spin" size={18} /></div>}
        {!messages.length && !loadingConversation && <div className="standalone-ai-empty"><Sparkles size={40} /><h2>Optima AI</h2><p>{t("chat.aiEmptyDesc")}</p></div>}
        {messages.map((message, index) => <article key={message.id ?? index} className={`standalone-ai-message ${message.role}`}>
          <small>{message.role === "model" ? "Optima AI" : user?.firstName}</small>
          {message.image && <img className="standalone-ai-image" src={message.image} alt="" />}
          {!message.image && message.hasImage && <span className="standalone-ai-image-note"><ImageIcon size={14} />{t("chat.aiImageSent")}</span>}
          {message.text && <p>{message.text}</p>}
          {message.failed && <button type="button" className="ai-message-retry" disabled={busy} onClick={() => void send(message.failed)}><ArrowUp size={16} />{t("common.retry")}</button>}
          {message.sources?.map(source => /^https?:\/\//i.test(source.url) && <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}
        </article>)}
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
    </div>
  </section>;
}
