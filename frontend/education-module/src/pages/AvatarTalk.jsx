import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import TutorAvatar from '../components/TutorAvatar.jsx';
import { Choice, PageHead, Switch } from '../components/ui.jsx';
import { TUTORS, tutorById } from '../data/avatars.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';
import { askAI, aiStatus } from '../lib/ai.js';
import { listen, speak, stopSpeaking, sttSupported, ttsSupported } from '../lib/speech.js';

const MODES = [
  { value: 'uz', label: 'O‘zbekcha suhbat', rec: 'uz-UZ' },
  { value: 'en', label: 'Inglizcha gaplashish', rec: 'en-US' },
];
const TOPICS = ['Menga bugun nimani o‘rganishni maslahat berasan?', 'Let’s talk about my family', 'Kvadrat tenglamani qanday yechaman?', 'IELTS speaking: describe your city'];

export default function AvatarTalk() {
  const { profile, updateProfile, addXp, mark } = useApp();
  const { t, lang } = useT();
  const [tutorId, setTutorId] = useState(profile.tutorId || 'kamron');
  const tutor = tutorById(tutorId);
  const [mode, setMode] = useState(tutor.lang === 'en' ? 'en' : 'uz');
  const [state, setState] = useState('idle'); // idle | listening | thinking | talking
  const [heard, setHeard] = useState('');
  const [subtitle, setSubtitle] = useState(tutor.hello);
  const [history, setHistory] = useState([]);
  const [voice, setVoice] = useState(true);
  const [rate, setRate] = useState(0.95);
  const [typed, setTyped] = useState('');
  const [online, setOnline] = useState(null);
  const stopRef = useRef(() => {});
  const fakeTimer = useRef();

  useEffect(() => { aiStatus().then((s) => setOnline(!!s.ai)); return () => { stopSpeaking(); stopRef.current(); clearTimeout(fakeTimer.current); }; }, []);

  function say(text) {
    setSubtitle(text);
    if (voice && ttsSupported()) {
      speak(text, {
        lang: /[а-яё]/i.test(text) ? 'ru-RU' : mode === 'en' && /^[\x00-\x7F’“”—–]+$/.test(text) ? 'en-US' : 'uz-UZ',
        gender: tutor.gender, rate,
        onStart: () => setState('talking'),
        onEnd: () => setState('idle'),
      });
      setState('talking');
    } else {
      // Ovoz o'chiq bo'lsa ham og'iz harakati matn uzunligiga qarab ko'rsatiladi
      setState('talking');
      clearTimeout(fakeTimer.current);
      fakeTimer.current = setTimeout(() => setState('idle'), Math.min(8000, 600 + text.length * 45));
    }
  }

  function chooseTutor(id) {
    stopSpeaking();
    setTutorId(id);
    updateProfile({ tutorId: id });
    const tu = tutorById(id);
    setMode(tu.lang === 'en' ? 'en' : 'uz');
    setHistory([]);
    setTimeout(() => say(tu.hello), 0);
  }

  async function ask(text) {
    const q = text.trim();
    if (!q) return;
    stopSpeaking();
    setHeard(q);
    setState('thinking');
    const msgs = [...history, { role: 'user', content: q }];
    setHistory(msgs);
    const { reply } = await askAI(msgs, { tutor: tutorId, lang: mode === 'en' ? 'en' : lang, mode: 'voice' });
    setHistory([...msgs, { role: 'assistant', content: reply }]);
    say(reply);
    mark('avatar');
    if (msgs.filter((m) => m.role === 'user').length <= 10) addXp(5, false);
  }

  function toggleMic() {
    if (state === 'listening') { stopRef.current(); setState('idle'); return; }
    stopSpeaking();
    setHeard('');
    setState('listening');
    let last = '';
    stopRef.current = listen({
      lang: MODES.find((m) => m.value === mode).rec,
      onResult: (txt, final) => { last = txt; setHeard(txt); if (final) { stopRef.current(); ask(txt); } },
      onEnd: () => setState((s) => (s === 'listening' ? 'idle' : s)),
      onError: () => { setState('idle'); if (!last) setSubtitle('Mikrofon ishlamadi. Ruxsat bering yoki pastda yozib yuboring.'); },
    });
  }

  const statusText = state === 'listening' ? t('avatar.listening') : state === 'thinking' ? t('avatar.thinking') : state === 'talking' ? t('avatar.speaking') : 'Mikrofonni bosing va gapiring';

  return (
    <>
      <PageHead eyebrow="Ovozli suhbat" title={t('nav.avatar')} sub="Ustoz sizni eshitadi, o‘ylaydi va ovoz chiqarib javob beradi. Matnli savollar uchun alohida “AI chat” bo‘limi bor.">
        <span className="pill-stat"><span style={{ width: 10, height: 10, borderRadius: '50%', background: online ? 'var(--green)' : 'var(--amber)' }} />{online === null ? '…' : online ? 'AI ulangan' : 'Oflayn demo'}</span>
      </PageHead>

      <section className="grid" style={{ '--min': '220px' }} aria-label={t('avatar.choose')}>
        {TUTORS.map((tu) => (
          <button key={tu.id} type="button" className={'tutor-pick' + (tu.id === tutorId ? ' on' : '')} aria-pressed={tu.id === tutorId} onClick={() => chooseTutor(tu.id)} style={{ '--tbg': tu.bg }}>
            <span className="tp-pic"><TutorAvatar id={tu.id} size={84} /></span>
            <span className="grow" style={{ textAlign: 'left' }}><b style={{ fontSize: 17 }}>{tu.name}</b><br /><span className="muted xs">{tu.role}</span><br /><span className="tag" style={{ fontSize: 11, padding: '2px 8px' }}>{tu.gender === 'male' ? 'Erkak ovozi' : 'Ayol ovozi'}</span></span>
            {tu.id === tutorId && <Icon name="tick" style={{ color: 'var(--green)' }} />}
          </button>
        ))}
      </section>

      <div className="split">
        <section className="stage col-main" style={{ '--tbg': tutor.bg }} aria-label="Avatar">
          <div className="stage-top">
            <span className="tag" style={{ background: '#fff' }}>{tutor.trait}</span>
            <Choice options={MODES} value={mode} onChange={setMode} variant="seg" label="Suhbat tili" />
          </div>
          <div className="stage-avatar" style={{ color: tutor.accent }}>
            <TutorAvatar id={tutor.id} size={280} state={state} label={`${tutor.name} avatari`} />
          </div>
          <div className="subtitle" aria-live="polite">
            <b>{tutor.name}:</b> {state === 'thinking' ? '…' : subtitle}
          </div>
          {heard && <div className="heard"><Icon name="user" size={16} /> {heard}</div>}
          <div className="stage-controls">
            <button type="button" className={'mic' + (state === 'listening' ? ' on' : '')} onClick={toggleMic} disabled={!sttSupported() || state === 'thinking'} aria-label={state === 'listening' ? 'To‘xtatish' : t('avatar.talk')}>
              <Icon name={state === 'listening' ? 'stop' : 'mic'} size={30} />
            </button>
            <span className="small" style={{ fontWeight: 600 }}>{statusText}</span>
            {state === 'talking' && <button type="button" className="btn ghost sm" onClick={() => { stopSpeaking(); setState('idle'); }}>Jim</button>}
          </div>
          {!sttSupported() && <p className="small muted" style={{ textAlign: 'center' }}>Bu brauzer mikrofonni tanimaydi — Chrome yoki Edge’dan foydalaning yoki pastda yozing.</p>}
          <form className="composer-box" style={{ background: '#fff' }} onSubmit={(e) => { e.preventDefault(); ask(typed); setTyped(''); }}>
            <label className="grow" style={{ display: 'flex' }}><span className="sr">Savol</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Yoki shu yerga yozing…" />
            </label>
            <button className="btn" type="submit" disabled={!typed.trim() || state === 'thinking'} aria-label="Yuborish" style={{ padding: '0 14px' }}><Icon name="send" /></button>
          </form>
        </section>

        <aside className="col-side">
          <section className="card stack">
            <h2 className="h3">Mavzu tanlang</h2>
            {TOPICS.map((q) => <button key={q} type="button" className="chip" style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 44, borderRadius: 12 }} onClick={() => ask(q)} disabled={state === 'thinking'}>{q}</button>)}
          </section>
          <section className="card stack">
            <h2 className="h3">Ovoz sozlamalari</h2>
            <div className="between"><span>Ovoz bilan javob</span><Switch checked={voice} onChange={setVoice} label="Ovoz bilan javob" /></div>
            <label className="stack-sm"><span className="between small"><span>Tezlik</span><b>{rate.toFixed(2)}×</b></span>
              <input type="range" min="0.6" max="1.3" step="0.05" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            </label>
            <button type="button" className="btn ghost sm" onClick={() => say(tutor.hello)}><Icon name="sound" />Ovozni sinash</button>
            <p className="muted xs">O‘zbekcha ovoz uchun Microsoft Edge tavsiya etiladi (Madina va Sardor ovozlari). Boshqa brauzerlarda eng yaqin ovoz tanlanadi.</p>
          </section>
          {history.length > 0 && (
            <section className="card stack-sm">
              <div className="between"><h2 className="h3">Suhbat</h2><button type="button" className="act" onClick={() => setHistory([])}>Tozalash</button></div>
              <div className="stack-sm" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {history.map((m, i) => <p key={i} className="small"><b>{m.role === 'user' ? 'Siz' : tutor.name}:</b> {m.content}</p>)}
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
