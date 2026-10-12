import { Brain, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n/i18n";
import { useToast } from "./Toast";

/** See, edit, clear or switch off what Optima AI remembers about you. */
export function AiMemoryPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { show } = useToast();
  const [content, setContent] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.chat.aiMemory()
      .then((memory) => { setContent(memory.content); setEnabled(memory.enabled); })
      .catch(() => setContent(""));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(patch: { content?: string; enabled?: boolean }, toast = true) {
    setSaving(true);
    try {
      const memory = await api.chat.saveAiMemory(patch);
      setContent(memory.content);
      setEnabled(memory.enabled);
      if (toast) show(t("chat.aiMemorySaved"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.aiNotResponding"), "error");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-layer ai-memory-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="ai-memory" role="dialog" aria-modal="true" aria-label={t("chat.aiMemoryTitle")}>
      <header>
        <span className="ai-memory-icon"><Brain size={20} /></span>
        <div><h2>{t("chat.aiMemoryTitle")}</h2><p>{t("chat.aiMemoryDesc")}</p></div>
        <button type="button" className="ai-memory-close" onClick={onClose} aria-label={t("publicProfile.closeAria")}><X size={18} /></button>
      </header>
      <label className="ai-memory-switch">
        <span>{t("chat.aiMemoryEnabled")}</span>
        <input type="checkbox" role="switch" checked={enabled} disabled={saving || content === null} onChange={(event) => void save({ enabled: event.target.checked }, false)} />
        <i aria-hidden="true"><b /></i>
      </label>
      {content === null
        ? <div className="ai-memory-loading"><LoaderCircle className="spin" size={20} /></div>
        : <>
          {!content && <p className="ai-memory-empty">{t("chat.aiMemoryEmpty")}</p>}
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={10} maxLength={3000} placeholder={t("chat.aiMemoryPlaceholder")} disabled={!enabled} aria-label={t("chat.aiMemory")} />
          <footer>
            <button type="button" className="ai-memory-clear" disabled={saving || !content} onClick={() => { if (window.confirm(t("chat.aiMemoryClearConfirm"))) void save({ content: "" }); }}><Trash2 size={15} />{t("chat.aiMemoryClear")}</button>
            <button type="button" className="ai-memory-save" disabled={saving || !enabled} onClick={() => void save({ content: content ?? "" })}>{saving && <LoaderCircle className="spin" size={15} />}{t("common.save")}</button>
          </footer>
        </>}
    </section>
  </div>;
}
