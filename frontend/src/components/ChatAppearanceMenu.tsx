import { Check, LoaderCircle, Palette, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useOutsideClose } from "../lib/useOutsideClose";

export type BackgroundType = "DEFAULT" | "IMAGE" | "COLOR" | "GRADIENT" | "PATTERN";

export type AppearanceValue = {
  backgroundUrl: string | null;
  backgroundType: BackgroundType;
  compactMode?: boolean;
  animationEnabled?: boolean;
  fontSize?: number | null;
};

const PRESETS: Array<{ label: string; backgroundType: BackgroundType; backgroundUrl: string | null; swatch: string }> = [
  { label: "Standart", backgroundType: "DEFAULT", backgroundUrl: null, swatch: "" },
  { label: "Lavanda", backgroundType: "GRADIENT", backgroundUrl: "linear-gradient(160deg,#EFEDFF,#CCC5FF)", swatch: "linear-gradient(160deg,#EFEDFF,#CCC5FF)" },
  { label: "Quyosh", backgroundType: "GRADIENT", backgroundUrl: "linear-gradient(160deg,#FDE68A,#FCA5A5)", swatch: "linear-gradient(160deg,#FDE68A,#FCA5A5)" },
  { label: "Okean", backgroundType: "GRADIENT", backgroundUrl: "linear-gradient(160deg,#A7F3D0,#67E8F9)", swatch: "linear-gradient(160deg,#A7F3D0,#67E8F9)" },
  { label: "Tun", backgroundType: "GRADIENT", backgroundUrl: "linear-gradient(160deg,#1E1B4B,#0A0A10)", swatch: "linear-gradient(160deg,#1E1B4B,#0A0A10)" },
  { label: "Zaytun", backgroundType: "COLOR", backgroundUrl: "#EFEAD9", swatch: "#EFEAD9" },
];

const FONT_SIZES = [13, 15, 17];

export function ChatAppearanceMenu({
  open,
  onClose,
  title,
  showPersonalization,
  value,
  onChange,
  onUploadFile,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  showPersonalization: boolean;
  value: AppearanceValue;
  onChange: (patch: Partial<AppearanceValue>) => void;
  onUploadFile?: (file: File) => Promise<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  useOutsideClose(ref, open, onClose);
  if (!open) return null;

  async function handleFilePick(file: File) {
    if (!onUploadFile) return;
    setUploading(true);
    try {
      const url = await onUploadFile(file);
      onChange({ backgroundUrl: url, backgroundType: "IMAGE" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="appearance-menu" ref={ref} role="dialog" aria-label={title}>
      <header>
        <Palette size={16} />
        <strong>{title}</strong>
        <button type="button" onClick={onClose} aria-label="Yopish"><X size={15} /></button>
      </header>
      <div className="appearance-swatches">
        {PRESETS.map((preset) => {
          const active = value.backgroundUrl === preset.backgroundUrl && value.backgroundType === preset.backgroundType;
          return (
            <button
              key={preset.label}
              type="button"
              className={`appearance-swatch ${active ? "active" : ""}`}
              style={{ background: preset.swatch || "var(--surface-muted)" }}
              onClick={() => onChange({ backgroundUrl: preset.backgroundUrl, backgroundType: preset.backgroundType })}
              title={preset.label}
              aria-label={preset.label}
            >
              {active && <Check size={14} />}
            </button>
          );
        })}
      </div>
      {onUploadFile && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFilePick(file); event.target.value = ""; }}
          />
          <button type="button" className="appearance-upload" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}
            Rasm yuklash
          </button>
        </>
      )}
      <form
        className="appearance-custom"
        onSubmit={(event) => {
          event.preventDefault();
          if (customUrl.trim()) onChange({ backgroundUrl: customUrl.trim(), backgroundType: "IMAGE" });
        }}
      >
        <input value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} placeholder="yoki rasm URL manzili" aria-label="Fon rasmi URL" />
        <button type="submit" disabled={!customUrl.trim()}>Qo‘llash</button>
      </form>
      {showPersonalization && (
        <div className="appearance-options">
          <label>
            <input type="checkbox" checked={!!value.compactMode} onChange={(event) => onChange({ compactMode: event.target.checked })} />
            Ixcham rejim
          </label>
          <label>
            <input type="checkbox" checked={value.animationEnabled !== false} onChange={(event) => onChange({ animationEnabled: event.target.checked })} />
            Animatsiyalar
          </label>
          <div className="appearance-font-size">
            <span>Shrift o‘lchami</span>
            <div>
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={(value.fontSize ?? 15) === size ? "active" : ""}
                  onClick={() => onChange({ fontSize: size })}
                  style={{ fontSize: size }}
                  aria-label={`Shrift o‘lchami ${size}px`}
                >
                  Aa
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
