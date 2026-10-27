import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Choice } from '../components/ui.jsx';
import TutorAvatar from '../components/TutorAvatar.jsx';
import { TUTORS, tutorById } from '../data/avatars.js';
import { askAI, aiStatus } from '../lib/ai.js';
import { speak, stopSpeaking } from '../lib/speech.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';

const KEY = 'optima-chats';
const QUICK = ['Present Perfect’ni oddiy tushuntir', 'x² − 5x + 6 = 0 ni bosqichma-bosqich yech', '“achieve” bilan 3 ta gap tuz', 'Menga 5 ta savollik test tuzib ber'];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

/** Juda oddiy markdown: **qalin**, `kod`, ro'yxat qatorlari. */
function Rich({ text }) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, j) => {
      if (p.startsWith('**')) return <b key={j}>{p.slice(2, -2)}</b>;
      if (p.startsWith('`')) return <code key={j}>{p.slice(1, -1)}</code>;
      return p;
    });
    const isList = /^\s*([-•*]|\d+[.)])\s/.test(line);
    return <div key={i} style={isList ? { paddingLeft: 8 } : undefined}>{parts.length ? parts : ' '}</div>;
  });
}

export default function Chat() {
  const { profile, addXp, mark } = useApp();
  const { t, lang } = useT();
  const [threads, setThreads] = useState(load);
  const [activeId, setActiveId] = useState(() => load()[0]?.id || null);
  const [tutorId, setTutorId] = useState(profile.tutorId || 'kamron');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(null);
  const [offlineNote, setOfflineNote] = useState(false);
  const [params, setParams] = useSearchParams();
  const logRef = useRef(null);
  const sentQ = useRef(false);
  const tutor = tutorById(tutorId);
  const active = threads.find((th) => th.id === activeId);
  const msgs = active?.messages || [];

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(threads.slice(0, 30))); } catch { /* */ } }, [threads]);
  useEffect(() => { aiStatus().then((s) => setOnline(!!s.ai)); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length, busy]);
  useEffect(() => {
    const q = params.get('q');
    if (q && !sentQ.current) { sentQ.current = true; setParams({}, { replace: true }); send(q, true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text, forceNew = false) {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    let id = forceNew ? null : activeId;
    let history = forceNew ? [] : msgs;
    if (!id) {
      id = 't' + Date.now();
      setThreads((ts) => [{ id, title: q.slice(0, 48), tutor: tutorId, date: new Date().toISOString(), messages: [] }, ...ts]);
      setActiveId(id);
      history = [];
    }
    const next = [...history, { role: 'user', content: q }];
    setThreads((ts) => ts.map((th) => (th.id === id ? { ...th, messages: next } : th)));
    setDraft('');
    setBusy(true);
    const { reply, offline } = await askAI(next, { tutor: tutorId, lang, mode: 'chat' });
    setOfflineNote(offline);
    setThreads((ts) => ts.map((th) => (th.id === id ? { ...th, messages: [...next, { role: 'assistant', content: reply }] } : th)));
    setBusy(false);
    mark('chat');
    if (next.filter((m) => m.role === 'user').length === 1) addXp(5, false);
  }

  function newThread() { setActiveId(null); setDraft(''); }
  function remove(id) { setThreads((ts) => ts.filter((th) => th.id !== id)); if (id === activeId) setActiveId(null); }

  return (
    <div className="chat">
      <section className="card chat-history" aria-label="Suhbatlar">
        <button className="btn block" type="button" style={{ marginBottom: 8 }} onClick={newThread}><Icon name="plus" />Yangi suhbat</button>
        {threads.length === 0 && <p className="muted small" style={{ padding: 8 }}>Hali suhbat yo‘q. Birinchi savolingizni yozing.</p>}
        {threads.map((th) => (
          <div key={th.id} className="row" style={{ gap: 4 }}>
            <button className={'thread' + (th.id === activeId ? ' on' : '')} type="button" onClick={() => setActiveId(th.id)}>
              <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{th.title}</b>
              <span className="muted xs">{tutorById(th.tutor).name} · {th.messages.length} xabar</span>
            </button>
            <button className="iconbtn bare" type="button" aria-label="O‘chirish" onClick={() => remove(th.id)} style={{ width: 36, height: 36 }}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </section>

      <section className="card chat-main">
        <header className="chat-head">
          <span className="ava" style={{ width: 44, height: 44, background: tutor.bg, overflow: 'hidden' }}><TutorAvatar id={tutor.id} size={44} /></span>
          <div className="grow"><h1 className="h2">{t('nav.chat')} · {tutor.name}</h1>
            <span className="muted small">{online === null ? '…' : online ? 'Claude AI ulangan' : 'Oflayn demo rejim — haqiqiy AI uchun .env ga kalit qo‘ying'}</span></div>
          <Link className="btn ghost sm" to="/avatar"><Icon name="mic" />Ovozli</Link>
        </header>

        <div className="chat-log" ref={logRef} aria-live="polite">
          {msgs.length === 0 && !busy && (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center', margin: 'auto', maxWidth: 460 }}>
              <span style={{ background: tutor.bg, borderRadius: '50%', overflow: 'hidden' }}><TutorAvatar id={tutor.id} size={110} /></span>
              <h2 className="h2">Salom! Men {tutor.name}.</h2>
              <p className="muted">{tutor.role}. Istalgan fan bo‘yicha savol bering — tushuntiraman, misol beraman, test tuzaman.</p>
              <div className="row-wrap" style={{ justifyContent: 'center' }}>{QUICK.map((q) => <button key={q} type="button" className="chip" onClick={() => send(q)}>{q}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={'msg' + (m.role === 'user' ? ' me' : '')}>
              {m.role !== 'user' && <span style={{ background: tutor.bg, borderRadius: '50%', overflow: 'hidden', flex: 'none' }}><TutorAvatar id={tutor.id} size={32} /></span>}
              <div className="bubble" style={{ whiteSpace: 'normal' }}>
                <Rich text={m.content} />
                {m.role !== 'user' && (
                  <div className="row" style={{ gap: 2, marginTop: 6, marginLeft: -8 }}>
                    <button type="button" className="act" style={{ minHeight: 32 }} onClick={() => speak(m.content, { lang: 'uz-UZ', gender: tutor.gender })}><Icon name="sound" size={16} />O‘qib berish</button>
                    <button type="button" className="act" style={{ minHeight: 32 }} onClick={() => { try { navigator.clipboard.writeText(m.content); } catch { /* */ } }}>Nusxa</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="msg"><span style={{ background: tutor.bg, borderRadius: '50%', overflow: 'hidden' }}><TutorAvatar id={tutor.id} size={32} /></span><div className="bubble typing" aria-label="Yozmoqda"><span /><span /><span /></div></div>}
        </div>

        <form className="composer" onSubmit={(e) => { e.preventDefault(); stopSpeaking(); send(); }}>
          {offlineNote && <span className="muted xs">Javob oflayn demo bazadan olindi.</span>}
          <div className="composer-box">
            <label className="grow" style={{ display: 'flex' }}><span className="sr">Xabar</span>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('chat.placeholder')} autoFocus />
            </label>
            <button className="btn" type="submit" aria-label="Yuborish" style={{ padding: '0 14px' }} disabled={!draft.trim() || busy}><Icon name="send" /></button>
          </div>
          <span className="muted xs">AI xato qilishi mumkin — muhim ma’lumotni darslik bilan tekshiring.</span>
        </form>
      </section>

      <aside className="chat-side">
        <section className="card stack">
          <h2 className="h3">Ustoz</h2>
          <Choice options={TUTORS.map((tu) => ({ value: tu.id, label: tu.name }))} value={tutorId} onChange={setTutorId} label="Ustoz" />
          <p className="muted xs">{tutor.role}. Har bir ustozning o‘z uslubi bor.</p>
        </section>
        <section className="card stack-sm">
          <h2 className="h3">Nima so‘rash mumkin?</h2>
          {['Qoidani tushuntirish', 'Misolni bosqichma-bosqich yechish', 'Insho yoki gapni tekshirish', 'Test va mashq tuzish', 'Tarjima va talaffuz'].map((x) => <span key={x} className="small row" style={{ gap: 8 }}><Icon name="tick" size={16} style={{ color: 'var(--green)' }} />{x}</span>)}
        </section>
      </aside>
    </div>
  );
}
