/**
 * Ustoz AI — demo "miya".
 * Hozir kalit so'zlar bo'yicha oldindan yozilgan javoblar qaytaradi.
 * Haqiqiy AI ulash uchun faqat shu funksiyani backend'ingizga so'rov
 * yuboradigan qilib almashtiring, masalan:
 *
 *   export async function askTutor(history, mode) {
 *     const res = await fetch('/api/tutor', { method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ history, mode }) });
 *     return (await res.json()).reply;
 *   }
 */
const RULES = [
  { test: /has finished|have finished/i, reply: 'Zo‘r, to‘g‘ri! “already” — Present Perfect belgisi, shuning uchun “has finished”.\n\n2-savol: “We ___ (go) to Bukhara two years ago.”' },
  { test: /\bwent\b/i, reply: 'Barakalla! “ago” — tugagan o‘tgan vaqt, demak Past Simple: went.\n\nKeyingi mavzuga o‘tamizmi yoki yana 3 ta mashq beraymi?' },
  { test: /finish/i, reply: 'Deyarli! Gapda “already” bor — bu Present Perfect belgisi. To‘g‘ri javob: “has finished”.\nYana bir urinib ko‘ramizmi?' },
  { test: /misol/i, reply: 'Mana yana ikkitasi:\n• I lost my keys yesterday. (vaqti aniq → Past Simple)\n• I have lost my keys. (hozir ham topilmagan → Present Perfect)' },
  { test: /sodda/i, reply: 'Oddiy qoida: “qachon?” degan savolga javob bo‘lsa — Past Simple. Natija hozir muhim bo‘lsa — Present Perfect.' },
  { test: /test/i, reply: 'Tayyor! 5 ta savollik test “Quiz va mashqlar” bo‘limiga qo‘shildi. Hoziroq boshlaysizmi?' },
  { test: /xato/i, reply: 'Kechagi 2 ta xatoingiz:\n1) “I goed” → to‘g‘risi “I went” (go — noto‘g‘ri fe’l).\n2) “Did you saw?” → “Did you see?” (did dan keyin fe’l 1-shaklda).\n\nIkkalasini mustahkamlash uchun 3 ta mashq beraymi?' },
  { test: /tenglama|masala|x²|x\^2|diskriminant/i, reply: 'Kvadrat tenglamani bosqichma-bosqich yechamiz:\n1) ax² + bx + c = 0 ko‘rinishiga keltiring.\n2) D = b² − 4ac ni hisoblang.\n3) D > 0 bo‘lsa, x = (−b ± √D) / 2a.\n\nTenglamangizni yozing — birga yechamiz.' },
  { test: /gaplash|speak|english/i, reply: 'Great, let’s practise! Tell me about your last weekend. What did you do?\n\n(Xato qilsangiz, men yumshoq qilib to‘g‘rilab boraman.)' },
  { test: /salom|assalom|hello|hi\b/i, reply: 'Salom! Bugun nimani o‘rganamiz: ingliz tili, matematika yoki boshqa fan?' },
];

const FALLBACK = {
  en: 'Yaxshi savol! Qisqacha tushuntiraman, keyin bitta misol beraman. Qaysi qismi eng tushunarsiz — qoida, misol yoki talaffuz?',
  math: 'Keling, masalani bosqichlarga bo‘lamiz. Avval nima berilgan va nima topilishi kerakligini yozing.',
  all: 'Tushundim. Bu mavzuni 3 qadamda tushuntiraman. Boshlaymizmi?',
};

export function askTutor(history, mode = 'en') {
  const last = history[history.length - 1]?.text || '';
  const rule = RULES.find((r) => r.test.test(last));
  const reply = rule ? rule.reply : FALLBACK[mode] || FALLBACK.all;
  const delay = 500 + Math.min(1200, reply.length * 6);
  return new Promise((resolve) => setTimeout(() => resolve(reply), delay));
}
