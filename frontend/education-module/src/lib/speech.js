/*
 * Ovoz: matnni o'qish (TTS) va mikrofon orqali tanib olish (STT).
 * Brauzerning Web Speech API'si — internet yoki kalit talab qilmaydi.
 * Eng yaxshi natija: Microsoft Edge (o'zbekcha "Madina" va "Sardor" ovozlari bor) yoki Chrome.
 */

const FEMALE = /female|zira|madina|samantha|victoria|karen|moira|tessa|aria|jenny|sonia|libby|natasha|emel|svetlana|dariya|ava|allison|susan|hazel|google uk english female|google us english/i;
const MALE = /\bmale|david|mark|sardor|daniel|alex|fred|guy|ryan|thomas|dmitry|ahmet|christopher|eric|george|james|brian|google uk english male/i;

let voicesCache = [];
function loadVoices() {
  try {
    voicesCache = window.speechSynthesis.getVoices();
    if (!voicesCache.length) window.speechSynthesis.onvoiceschanged = () => { voicesCache = window.speechSynthesis.getVoices(); };
  } catch { /* */ }
  return voicesCache;
}
if (typeof window !== 'undefined') loadVoices();

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const sttSupported = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function pickVoice(lang = 'en-US', gender) {
  const voices = loadVoices();
  const base = lang.slice(0, 2);
  const fallbacks = base === 'uz' ? ['uz', 'tr', 'ru'] : [base];
  for (const b of fallbacks) {
    const pool = voices.filter((v) => v.lang?.toLowerCase().startsWith(b)).sort((a, c) => Number(c.lang?.toLowerCase() === lang.toLowerCase()) - Number(a.lang?.toLowerCase() === lang.toLowerCase()));
    if (!pool.length) continue;
    const re = gender === 'female' ? FEMALE : gender === 'male' ? MALE : null;
    const exact = re ? pool.find((v) => re.test(v.name) && !(gender === 'female' && MALE.test(v.name) && !FEMALE.test(v.name))) : null;
    return { voice: exact || pool[0], matched: !!exact, lang: b };
  }
  return { voice: null, matched: false, lang: base };
}

/** Matnni ovoz chiqarib o'qiydi. Qaytaradi: to'xtatish funksiyasi. */
export function speak(text, { lang = 'en-US', gender, rate = 0.95, onStart, onEnd, onBoundary, onError } = {}) {
  if (!ttsSupported() || !text) { onEnd?.(); return () => {}; }
  try {
    window.speechSynthesis.cancel();
    const clean = String(text).replace(/[*_#`>•]/g, '').replace(/\s+/g, ' ').trim();
    const u = new SpeechSynthesisUtterance(clean);
    const { voice, matched } = pickVoice(lang, gender);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = lang;
    u.rate = rate;
    // Mos jinsdagi ovoz topilmasa, ohangni o'zgartirib farqlaymiz
    u.pitch = matched || !gender ? 1 : gender === 'male' ? 0.8 : 1.2;
    u.onstart = () => onStart?.();
    u.onend = () => onEnd?.();
    u.onerror = (event) => { if (!['canceled', 'interrupted'].includes(event.error)) onError?.(event); onEnd?.(); };
    u.onboundary = (e) => onBoundary?.(e);
    window.speechSynthesis.speak(u);
    return () => { try { window.speechSynthesis.cancel(); } catch { /* */ } onEnd?.(); };
  } catch {
    onError?.();
    onEnd?.();
    return () => {};
  }
}

export function stopSpeaking() {
  try { window.speechSynthesis.cancel(); } catch { /* */ }
}

/** Mikrofonni tinglaydi. onResult(matn, yakuniymi). Qaytaradi: to'xtatish funksiyasi. */
export function listen({ lang = 'uz-UZ', onResult, onEnd, onError } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) { onError?.('unsupported'); return () => {}; }
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) { text += e.results[i][0].transcript; if (e.results[i].isFinal) final = true; }
    onResult?.(text, final);
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => onEnd?.();
  try { rec.start(); } catch { onError?.('start'); }
  return () => { try { rec.stop(); } catch { /* */ } };
}

/** Talaffuzni baholash: aytilgan matn kutilgan so'zga qanchalik yaqin (0–100). */
export function pronunciationScore(heard, expected) {
  const a = String(heard).toLowerCase().replace(/[^a-z ]/g, '').trim();
  const b = String(expected).toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (!a) return 0;
  if (a === b || a.split(' ').includes(b)) return 100;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return Math.max(0, Math.round((1 - dp[a.length][b.length] / Math.max(a.length, b.length)) * 100));
}
