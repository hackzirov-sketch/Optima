import { FileText, Image, LoaderCircle, MapPin, Mic, Paperclip, UserRound, Video } from "lucide-react";
import { useRef, useState } from "react";
import { useOutsideClose } from "../lib/useOutsideClose";

export type AttachKind = "image" | "video" | "document" | "audio";

const ACCEPT: Record<AttachKind, string> = {
  image: "image/*",
  video: "video/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt",
  audio: "audio/*",
};

export function AttachMenuButton({ uploading, onPick }: { uploading: boolean; onPick: (file: File, kind: AttachKind) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<AttachKind>("document");

  useOutsideClose(wrapRef, open, () => setOpen(false));

  function choose(kind: AttachKind) {
    pendingKind.current = kind;
    setOpen(false);
    const input = inputRef.current;
    if (!input) return;
    input.accept = ACCEPT[kind];
    input.value = "";
    input.click();
  }

  return (
    <span className="attach-menu-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file, pendingKind.current);
        }}
      />
      <button type="button" className={`icon-button ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} disabled={uploading} aria-label="Fayl biriktirish" aria-expanded={open} aria-haspopup="true">
        {uploading ? <LoaderCircle className="spin" size={19} /> : <Paperclip size={20} />}
      </button>
      {open && (
        <div className="attach-menu" role="menu" aria-label="Biriktirish turi">
          <button type="button" role="menuitem" onClick={() => choose("image")}><span className="attach-menu-icon attach-icon-image"><Image size={17} /></span>Rasm</button>
          <button type="button" role="menuitem" onClick={() => choose("video")}><span className="attach-menu-icon attach-icon-video"><Video size={17} /></span>Video</button>
          <button type="button" role="menuitem" onClick={() => choose("document")}><span className="attach-menu-icon attach-icon-document"><FileText size={17} /></span>Hujjat</button>
          <button type="button" role="menuitem" onClick={() => choose("audio")}><span className="attach-menu-icon attach-icon-audio"><Mic size={17} /></span>Audio</button>
          <button type="button" role="menuitem" disabled><span className="attach-menu-icon attach-icon-location"><MapPin size={17} /></span>Manzil <small>tez orada</small></button>
          <button type="button" role="menuitem" disabled><span className="attach-menu-icon attach-icon-contact"><UserRound size={17} /></span>Kontakt <small>tez orada</small></button>
        </div>
      )}
    </span>
  );
}
