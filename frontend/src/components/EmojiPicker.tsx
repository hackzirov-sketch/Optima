import { Clock, Search, Smile, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useOutsideClose } from "../lib/useOutsideClose";

type EmojiEntry = { char: string; keywords: string; skin?: boolean };
type Category = { key: string; label: string; icon: string; emojis: EmojiEntry[] };

const CATEGORIES: Category[] = [
  {
    key: "smileys", label: "Kayfiyat", icon: "😀",
    emojis: [
      { char: "😀", keywords: "kulish xursand smile" }, { char: "😁", keywords: "kulish xursand" },
      { char: "😂", keywords: "kulgi yosh" }, { char: "🤣", keywords: "kulgi rofl" },
      { char: "😊", keywords: "xursand uyalish" }, { char: "😍", keywords: "sevgi ko'z" },
      { char: "😘", keywords: "bo'sa sevgi" }, { char: "😉", keywords: "ko'z qisish" },
      { char: "😎", keywords: "sovuqqon ko'zoynak" }, { char: "🤩", keywords: "hayrat yulduz" },
      { char: "🥳", keywords: "bayram tug'ilgan kun" }, { char: "😢", keywords: "yig'lash gam" },
      { char: "😭", keywords: "yig'lash qattiq" }, { char: "😡", keywords: "jahl gazab" },
      { char: "😱", keywords: "qo'rquv" }, { char: "😴", keywords: "uyqu" },
      { char: "🤔", keywords: "o'ylash" }, { char: "😅", keywords: "noqulay kulish" },
      { char: "🙄", keywords: "zerikish" }, { char: "😇", keywords: "farishta" },
      { char: "🥰", keywords: "sevgi yurak" }, { char: "😏", keywords: "ayyor" },
      { char: "🤗", keywords: "quchoq" }, { char: "😷", keywords: "kasal niqob" },
    ],
  },
  {
    key: "gestures", label: "Imo-ishora", icon: "👍",
    emojis: [
      { char: "👍", keywords: "yoqdi zo'r", skin: true }, { char: "👎", keywords: "yoqmadi", skin: true },
      { char: "👏", keywords: "qarsak", skin: true }, { char: "🙏", keywords: "iltimos duo", skin: true },
      { char: "👋", keywords: "salom xayr", skin: true }, { char: "✌️", keywords: "tinchlik", skin: true },
      { char: "🤝", keywords: "kelishuv qo'l" }, { char: "💪", keywords: "kuch", skin: true },
      { char: "🙌", keywords: "quvonch", skin: true }, { char: "👌", keywords: "ok", skin: true },
      { char: "🤞", keywords: "omad", skin: true }, { char: "✋", keywords: "to'xta", skin: true },
      { char: "👆", keywords: "yuqoriga", skin: true }, { char: "👇", keywords: "pastga", skin: true },
      { char: "❤️", keywords: "sevgi yurak" }, { char: "🔥", keywords: "olov zo'r" },
      { char: "🎉", keywords: "bayram" }, { char: "✅", keywords: "tasdiq" },
      { char: "⭐", keywords: "yulduz" }, { char: "💯", keywords: "yuz foiz" },
    ],
  },
  {
    key: "animals", label: "Hayvonlar", icon: "🐶",
    emojis: [
      { char: "🐶", keywords: "it" }, { char: "🐱", keywords: "mushuk" },
      { char: "🐭", keywords: "sichqon" }, { char: "🐰", keywords: "quyon" },
      { char: "🦊", keywords: "tulki" }, { char: "🐻", keywords: "ayiq" },
      { char: "🐼", keywords: "panda" }, { char: "🐨", keywords: "koala" },
      { char: "🐯", keywords: "yo'lbars" }, { char: "🦁", keywords: "sher" },
      { char: "🐮", keywords: "sigir" }, { char: "🐷", keywords: "cho'chqa" },
      { char: "🐸", keywords: "qurbaqa" }, { char: "🐵", keywords: "maymun" },
      { char: "🐔", keywords: "tovuq" }, { char: "🐧", keywords: "pingvin" },
      { char: "🦄", keywords: "bir shoxli ot" }, { char: "🐢", keywords: "toshbaqa" },
    ],
  },
  {
    key: "food", label: "Ovqat", icon: "🍕",
    emojis: [
      { char: "🍏", keywords: "olma" }, { char: "🍊", keywords: "apelsin" },
      { char: "🍌", keywords: "banan" }, { char: "🍉", keywords: "tarvuz" },
      { char: "🍇", keywords: "uzum" }, { char: "🍓", keywords: "qulupnay" },
      { char: "🍕", keywords: "pitsa" }, { char: "🍔", keywords: "burger" },
      { char: "🍟", keywords: "kartoshka fri" }, { char: "🌭", keywords: "hot dog" },
      { char: "🍿", keywords: "popkorn" }, { char: "🍩", keywords: "donut" },
      { char: "🍪", keywords: "pechenye" }, { char: "🎂", keywords: "tort" },
      { char: "☕", keywords: "qahva" }, { char: "🍵", keywords: "choy" },
      { char: "🍺", keywords: "pivo" }, { char: "🍎", keywords: "olma qizil" },
    ],
  },
  {
    key: "activities", label: "Faoliyat", icon: "⚽",
    emojis: [
      { char: "⚽", keywords: "futbol" }, { char: "🏀", keywords: "basketbol" },
      { char: "🎮", keywords: "o'yin" }, { char: "🎲", keywords: "zar" },
      { char: "🎧", keywords: "musiqa" }, { char: "🎸", keywords: "gitara" },
      { char: "🎯", keywords: "nishon" }, { char: "🏆", keywords: "kubok g'olib" },
      { char: "🚴", keywords: "velosiped", skin: true }, { char: "🏃", keywords: "yugurish", skin: true },
      { char: "🧘", keywords: "meditatsiya", skin: true }, { char: "🎨", keywords: "rasm" },
    ],
  },
  {
    key: "travel", label: "Sayohat", icon: "✈️",
    emojis: [
      { char: "✈️", keywords: "samolyot" }, { char: "🚗", keywords: "mashina" },
      { char: "🚕", keywords: "taksi" }, { char: "🚀", keywords: "raketa" },
      { char: "🚲", keywords: "velosiped" }, { char: "🏠", keywords: "uy" },
      { char: "🏢", keywords: "bino ofis" }, { char: "🗺️", keywords: "xarita" },
      { char: "🌆", keywords: "shahar" }, { char: "🌅", keywords: "quyosh chiqishi" },
      { char: "🌙", keywords: "oy" }, { char: "⛰️", keywords: "tog'" },
    ],
  },
  {
    key: "objects", label: "Ob'ektlar", icon: "💡",
    emojis: [
      { char: "💡", keywords: "lampa g'oya" }, { char: "📱", keywords: "telefon" },
      { char: "💻", keywords: "kompyuter" }, { char: "⌚", keywords: "soat" },
      { char: "📷", keywords: "kamera" }, { char: "🎁", keywords: "sovg'a" },
      { char: "📌", keywords: "pin" }, { char: "🔒", keywords: "qulf" },
      { char: "🔑", keywords: "kalit" }, { char: "💰", keywords: "pul" },
      { char: "📎", keywords: "skrepka" }, { char: "🗂️", keywords: "papka fayl" },
    ],
  },
  {
    key: "symbols", label: "Belgilar", icon: "❗",
    emojis: [
      { char: "❗", keywords: "undov belgi" }, { char: "❓", keywords: "savol belgi" },
      { char: "💤", keywords: "uyqu" }, { char: "💬", keywords: "gaplashuv xabar" },
      { char: "✔️", keywords: "belgi tasdiq" }, { char: "➕", keywords: "qo'shish" },
      { char: "➖", keywords: "ayirish" }, { char: "🔔", keywords: "qo'ng'iroq bildirishnoma" },
      { char: "🔇", keywords: "ovozsiz" }, { char: "♻️", keywords: "qayta ishlash" },
      { char: "🆗", keywords: "ok" }, { char: "🆕", keywords: "yangi" },
    ],
  },
];

const SKIN_TONES = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
const RECENT_KEY = "optima:recentEmojis";
const GRID_COLUMNS = 8;

function loadRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 24) : [];
  } catch {
    return [];
  }
}

function saveRecent(emoji: string) {
  const current = loadRecent().filter((item) => item !== emoji);
  const next = [emoji, ...current].slice(0, 24);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}

export function EmojiPickerButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].key);
  const [skinTone, setSkinTone] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  useOutsideClose(wrapRef, open, close);

  const results = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return CATEGORIES.flatMap((category) => category.emojis).filter((entry) => entry.keywords.includes(q) || entry.char === q);
    }
    return CATEGORIES.find((category) => category.key === activeCategory)?.emojis || [];
  }, [query, activeCategory]);

  function pick(entry: EmojiEntry) {
    const emoji = entry.skin && skinTone ? `${entry.char}${SKIN_TONES[skinTone]}` : entry.char;
    onSelect(emoji);
    saveRecent(emoji);
    setRecent(loadRecent());
  }

  function moveFocus(delta: number) {
    const buttons = gridRef.current ? Array.from(gridRef.current.querySelectorAll<HTMLButtonElement>("button")) : [];
    const currentIndex = buttons.findIndex((button) => button === document.activeElement);
    const nextIndex = Math.min(buttons.length - 1, Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + delta));
    buttons[nextIndex]?.focus();
  }

  return (
    <span className="emoji-menu-wrap" ref={wrapRef}>
      <button type="button" className={`icon-button ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} aria-label="Emoji tanlash" aria-expanded={open} aria-haspopup="true">
        <Smile size={20} />
      </button>
      {open && (
        <div className="emoji-picker" role="dialog" aria-label="Emoji tanlash paneli">
          <div className="emoji-picker-search">
            <Search size={15} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(GRID_COLUMNS); }
                if (event.key === "Enter" && results[0]) { event.preventDefault(); pick(results[0]); }
              }}
              placeholder="Emoji qidirish"
              aria-label="Emoji qidirish"
            />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Tozalash"><X size={14} /></button>}
          </div>
          {!query && (
            <div className="emoji-picker-tabs" role="tablist">
              {CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === category.key}
                  className={activeCategory === category.key ? "active" : ""}
                  onClick={() => setActiveCategory(category.key)}
                  title={category.label}
                >
                  {category.icon}
                </button>
              ))}
            </div>
          )}
          {!query && recent.length > 0 && (
            <div className="emoji-picker-recent">
              <small><Clock size={12} /> So‘nggi</small>
              <div className="emoji-picker-grid emoji-picker-grid-recent">
                {recent.map((emoji, index) => (
                  <button key={`${emoji}-${index}`} type="button" onClick={() => pick({ char: emoji, keywords: "" })}>{emoji}</button>
                ))}
              </div>
            </div>
          )}
          <div
            className="emoji-picker-grid"
            ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)` }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); moveFocus(1); }
              if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus(-1); }
              if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(GRID_COLUMNS); }
              if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(-GRID_COLUMNS); }
            }}
          >
            {results.map((entry, index) => (
              <button key={`${entry.char}-${index}`} type="button" onClick={() => pick(entry)} title={entry.keywords}>
                {entry.skin && skinTone ? `${entry.char}${SKIN_TONES[skinTone]}` : entry.char}
              </button>
            ))}
            {results.length === 0 && <span className="emoji-picker-empty">Topilmadi</span>}
          </div>
          <div className="emoji-picker-skins">
            {SKIN_TONES.map((tone, index) => (
              <button
                key={index}
                type="button"
                className={`emoji-skin-swatch emoji-skin-${index} ${skinTone === index ? "active" : ""}`}
                onClick={() => setSkinTone(index)}
                aria-label={index === 0 ? "Standart teri rangi" : `Teri rangi ${index}`}
              />
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
