import { LoaderCircle, MessagesSquare, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { emitWithAck, getSocket, isServerRejection } from "../lib/socket";
import { decryptMessage, sendWithE2ee } from "../lib/e2ee";
import type { ChatMessage } from "../types";
import { Avatar } from "./ui";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function senderName(message: ChatMessage) {
  return message.sender ? `${message.sender.firstName} ${message.sender.lastName}`.trim() : "Foydalanuvchi";
}

export function ThreadPanel({
  root,
  currentUserId,
  onClose,
  onReplyCountChange,
}: {
  root: ChatMessage;
  currentUserId?: string;
  onClose: () => void;
  onReplyCountChange: (rootId: string, count: number) => void;
}) {
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReplies([]);
    void api.chat.getThread(root.id)
      .then((result) => { if (!cancelled) setReplies(result.replies); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [root.id]);

  useEffect(() => {
    const socket = getSocket();
    async function handleThreadReply(payload: { threadRootId: string; threadReplyCount: number | null; message: ChatMessage }) {
      if (payload.threadRootId !== root.id) return;
      const message = await decryptMessage(payload.message);
      setReplies((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      if (payload.threadReplyCount != null) onReplyCountChange(root.id, payload.threadReplyCount);
    }
    socket.on("thread_reply", handleThreadReply);
    return () => { socket.off("thread_reply", handleThreadReply); };
  }, [root.id, onReplyCountChange]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [replies.length]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft("");
    const clientMessageId = crypto.randomUUID();
    try {
      const viaRest = async () => {
        const saved = await api.chat.sendThreadReply(root.id, content, clientMessageId, root.roomId);
        setReplies((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
        onReplyCountChange(root.id, (root.threadReplyCount ?? 0) + replies.length + 1);
      };
      if (getSocket().connected) {
        try {
          // Encrypted on this device for E2EE rooms; re-keyed and retried if stale.
          await sendWithE2ee(root.roomId, content, (body) =>
            emitWithAck("send_thread_reply", { threadRootId: root.id, text: body.content, e2ee: body.e2ee, clientMessageId }));
        } catch (error) {
          if (isServerRejection(error)) throw error;
          await viaRest();
        }
      } else {
        await viaRest();
      }
    } catch {
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="thread-panel" role="complementary" aria-label="Thread">
      <header>
        <MessagesSquare size={16} />
        <strong>Thread</strong>
        <button type="button" onClick={onClose} aria-label="Threadni yopish"><X size={17} /></button>
      </header>
      <div className="thread-panel-root">
        <Avatar firstName={root.sender?.firstName} lastName={root.sender?.lastName} url={root.sender?.avatarUrl} size="sm" />
        <div>
          <strong>{senderName(root)}</strong>
          <p>{root.content || "Media xabar"}</p>
          <time>{formatTime(root.createdAt)}</time>
        </div>
      </div>
      <div className="thread-panel-list" ref={listRef}>
        {loading && <div className="thread-panel-loading"><LoaderCircle className="spin" size={18} /></div>}
        {!loading && replies.length === 0 && <div className="thread-panel-empty">Hali javob yo‘q. Birinchi bo‘lib javob yozing.</div>}
        {replies.map((reply) => (
          <div key={reply.id} className={`thread-reply ${reply.senderId === currentUserId ? "thread-reply-mine" : ""}`}>
            <Avatar firstName={reply.sender?.firstName} lastName={reply.sender?.lastName} url={reply.sender?.avatarUrl} size="sm" />
            <div>
              <strong>{senderName(reply)}</strong>
              <p>{reply.content || "Media xabar"}</p>
              <time>{formatTime(reply.createdAt)}</time>
            </div>
          </div>
        ))}
      </div>
      <div className="thread-panel-composer">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
          placeholder="Threadga javob yozing"
          rows={1}
          aria-label="Thread javobi"
        />
        <button type="button" onClick={() => void send()} disabled={!draft.trim() || sending} aria-label="Yuborish">
          {sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
        </button>
      </div>
    </aside>
  );
}
