import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/*
 * Global holat: hisob (demo auth), XP tarixi, so'zlar (oraliq takrorlash),
 * xatolar daftari, darslar/hikoyalar/matematika natijalari.
 * Hammasi localStorage'da, har bir foydalanuvchi uchun alohida saqlanadi.
 * Haqiqiy loyihada bu funksiyalar backend API'ni chaqiradi.
 */

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayShift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };

/* Leitner tizimi: quti raqami oshgani sari takrorlash oralig'i uzayadi (kunlarda). */
const BOX_DAYS = [0, 1, 2, 4, 7, 15, 30];

function hash(s) { // demo uchun oddiy hash — haqiqiy loyihada parol faqat serverda (bcrypt) tekshiriladi
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

const EMPTY = {
  profile: { name: '', role: 'student', grade: 9, goals: ['en'], tutorId: 'kamron', goalXp: 100, onboarded: false },
  totalXp: 0, xpByDay: {}, learned: {}, savedWords: [], mistakes: [],
  lessonsDone: {}, storiesDone: {}, mathDone: {}, quiz: { answered: 0, correct: 0 }, games: { played: 0, best: 0 },
  todayKinds: { date: '', list: [] },
};

function demoData() {
  const xpByDay = {};
  [[-6, 140], [-5, 210], [-4, 95], [-3, 250], [-2, 180], [-1, 120]].forEach(([d, v]) => { xpByDay[dayShift(d)] = v; });
  const learned = {};
  for (let id = 1; id <= 64; id++) learned[id] = { box: (id % 5) + 1, due: dayShift((id % 4) - 1) };
  return {
    ...EMPTY,
    profile: { ...EMPTY.profile, name: 'Dilnoza Karimova', grade: 9, goals: ['en', 'math'], tutorId: 'malika', goalXp: 150, onboarded: true },
    totalXp: 2450 + 995, xpByDay, learned, savedWords: ['achieve', 'resilient'],
    lessonsDone: { 1: 92, 2: 83, 3: 100 }, storiesDone: { 'my-day': 3 },
    mathDone: { '9-0': 4, '8-1': 5 }, quiz: { answered: 120, correct: 97 }, games: { played: 6, best: 140 },
    mistakes: [
      { id: 'm1', kind: 'word', prompt: 'borrow', answer: 'qarzga olmoq', given: 'qarz bermoq', source: 'Bulutlar o‘yini', at: dayShift(-1), hits: 0 },
      { id: 'm2', kind: 'grammar', prompt: 'He ___ like fish.', answer: 'doesn’t', given: 'don’t', source: '9-dars: Present Simple', at: dayShift(-2), hits: 1 },
      { id: 'm3', kind: 'math', prompt: 'x² − 7x + 10 = 0. Ildizlar yig‘indisi = ?', answer: '7', given: '−7', source: 'Matematika 9-sinf', at: dayShift(-2), hits: 0 },
    ],
  };
}

function readUsers() { try { return JSON.parse(localStorage.getItem('optima-users') || '{}'); } catch { return {}; } }
function writeUsers(u) { try { localStorage.setItem('optima-users', JSON.stringify(u)); } catch { /* */ } }
function readData(login) {
  try {
    const raw = localStorage.getItem('optima-data:' + login);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch { /* */ }
  if (login.startsWith('optima:')) {
    const data = demoData();
    data.profile.name = new URLSearchParams(window.location.search).get('name') || 'O‘quvchi';
    return data;
  }
  return login === 'demo' ? demoData() : { ...EMPTY };
}

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(() => {
    const learner = new URLSearchParams(window.location.search).get('learner');
    if (learner) return 'optima:' + learner;
    try { return localStorage.getItem('optima-session') || 'demo'; } catch { return 'demo'; }
  });
  const [data, setData] = useState(() => (session ? readData(session) : { ...EMPTY }));
  const [toast, setToast] = useState(null);
  const timer = useRef();

  useEffect(() => {
    if (!session) return;
    try { localStorage.setItem('optima-data:' + session, JSON.stringify(data)); } catch { /* */ }
  }, [data, session]);

  const notify = useCallback((text) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const startSession = (login) => {
    try { localStorage.setItem('optima-session', login); } catch { /* */ }
    setSession(login);
    setData(readData(login));
  };

  const auth = useMemo(() => ({
    login(loginId, password) {
      const id = loginId.trim().toLowerCase();
      const users = readUsers();
      if (!users[id] || users[id].pass !== hash(password)) return 'Login yoki parol noto‘g‘ri';
      startSession(id);
      return null;
    },
    register(name, loginId, password) {
      const id = loginId.trim().toLowerCase();
      if (!name.trim() || id.length < 4) return 'Ism va telefon/emailni to‘liq kiriting';
      if (password.length < 6) return 'Parol kamida 6 belgidan iborat bo‘lsin';
      const users = readUsers();
      if (users[id]) return 'Bu login bilan hisob allaqachon bor';
      users[id] = { name: name.trim(), pass: hash(password), created: today() };
      writeUsers(users);
      const fresh = { ...EMPTY, profile: { ...EMPTY.profile, name: name.trim() } };
      try { localStorage.setItem('optima-data:' + id, JSON.stringify(fresh)); } catch { /* */ }
      startSession(id);
      return null;
    },
    demo() { startSession('demo'); },
    logout() {
      try { localStorage.removeItem('optima-session'); } catch { /* */ }
      setSession(null);
      setData({ ...EMPTY });
    },
  }), []);

  const update = (fn) => setData((d) => fn(d));

  const actions = useMemo(() => ({
    updateProfile: (patch) => update((d) => ({ ...d, profile: { ...d.profile, ...patch } })),
    addXp: (n, reason) => {
      update((d) => ({ ...d, totalXp: d.totalXp + n, xpByDay: { ...d.xpByDay, [today()]: (d.xpByDay[today()] || 0) + n } }));
      if (reason !== false) notify(<><b>+{n} XP</b>{reason ? ` · ${reason}` : ''}</>);
    },
    recordAnswer: (correct) => update((d) => ({ ...d, quiz: { answered: d.quiz.answered + 1, correct: d.quiz.correct + (correct ? 1 : 0) } })),
    learnWord: (id, quality) => update((d) => {
      // quality: 2 = bilaman, 1 = qiyin, 0 = bilmayman
      const cur = d.learned[id] || { box: 0 };
      const box = quality === 2 ? Math.min(6, cur.box + 1) : quality === 1 ? Math.max(1, cur.box) : 0;
      return { ...d, learned: { ...d.learned, [id]: { box, due: dayShift(BOX_DAYS[box]) } } };
    }),
    saveWord: (en) => {
      update((d) => (d.savedWords.includes(en) ? d : { ...d, savedWords: [...d.savedWords, en] }));
      notify(<>“{en}” so‘zlaringizga qo‘shildi</>);
    },
    removeSaved: (en) => update((d) => ({ ...d, savedWords: d.savedWords.filter((w) => w !== en) })),
    addMistake: (m) => update((d) => {
      if (d.mistakes.some((x) => x.prompt === m.prompt && x.answer === m.answer)) return d;
      return { ...d, mistakes: [{ id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), at: today(), hits: 0, ...m }, ...d.mistakes].slice(0, 200) };
    }),
    hitMistake: (id, ok) => update((d) => ({
      ...d,
      mistakes: d.mistakes
        .map((m) => (m.id === id ? { ...m, hits: ok ? m.hits + 1 : 0 } : m))
        .filter((m) => m.hits < 2), // ikki marta ketma-ket to'g'ri — daftardan chiqadi
    })),
    completeLesson: (id, score) => update((d) => ({ ...d, lessonsDone: { ...d.lessonsDone, [id]: Math.max(score, d.lessonsDone[id] || 0) } })),
    completeStory: (id, score) => update((d) => ({ ...d, storiesDone: { ...d.storiesDone, [id]: Math.max(score, d.storiesDone[id] || 0) } })),
    completeMath: (key, score) => update((d) => ({ ...d, mathDone: { ...d.mathDone, [key]: Math.max(score, d.mathDone[key] || 0) } })),
    mark: (kind) => update((d) => {
      const cur = d.todayKinds?.date === today() ? d.todayKinds.list : [];
      return cur.includes(kind) ? d : { ...d, todayKinds: { date: today(), list: [...cur, kind] } };
    }),
    recordGame: (score) => update((d) => ({ ...d, games: { played: d.games.played + 1, best: Math.max(d.games.best, score) } })),
    resetData: () => setData(session === 'demo' ? demoData() : { ...EMPTY, profile: { ...data.profile } }),
  }), [notify, session, data.profile]);

  /* Hisoblangan statistika */
  const stats = useMemo(() => {
    const todayXp = data.xpByDay[today()] || 0;
    let streak = 0;
    for (let i = todayXp > 0 ? 0 : 1; i < 400; i++) {
      if ((data.xpByDay[dayShift(-i)] || 0) > 0) streak++; else break;
    }
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 6 + i);
      return { date: today(d), xp: data.xpByDay[today(d)] || 0, wd: d.getDay() };
    });
    const learnedCount = Object.values(data.learned).filter((w) => w.box >= 2).length;
    const dueCount = Object.values(data.learned).filter((w) => w.due <= today()).length;
    const accuracy = data.quiz.answered ? Math.round((data.quiz.correct / data.quiz.answered) * 100) : 0;
    return {
      todayXp, streak, week, weekXp: week.reduce((s, x) => s + x.xp, 0), learnedCount, dueCount, accuracy,
      lessonsDone: Object.keys(data.lessonsDone).length, storiesDone: Object.keys(data.storiesDone).length,
      mathDone: Object.keys(data.mathDone).length, mistakes: data.mistakes.length,
      doneToday: data.todayKinds?.date === today() ? data.todayKinds.list : [],
    };
  }, [data]);

  const value = { session, user: session, ...data, stats, auth, notify, ...actions };

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
