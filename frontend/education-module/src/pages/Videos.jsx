import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Choice, PageHead } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

/*
 * YouTube integratsiyasi: har bir videoga `youtubeId` bering (masalan "dQw4w9WgXcQ" —
 * youtube.com/watch?v=<ID> dagi qism). ID bo'lsa, haqiqiy pleyer ochiladi.
 * Haqiqiy loyihada ro'yxatni YouTube Data API v3 (playlistItems) orqali backend'dan oling.
 */
const VIDEOS = [
  { id: 1, youtubeId: null, title: 'Past Simple: noto‘g‘ri fe’llar 15 daqiqada', cat: 'Ingliz tili', k: 'en', level: 'A2', dur: '14:20', bg: '#DCE3FB' },
  { id: 2, youtubeId: null, title: 'Present Perfect: oddiy tushuntirish', cat: 'Ingliz tili', k: 'en', level: 'B1', dur: '12:30', bg: '#DCE3FB' },
  { id: 3, youtubeId: null, title: 'Diskriminant orqali yechish', cat: 'Matematika', k: 'math', level: '9-sinf', dur: '18:05', bg: '#D6EFE3' },
  { id: 4, youtubeId: null, title: 'IELTS Speaking: 1-qism maslahatlari', cat: 'IELTS', k: 'ielts', level: 'B1+', dur: '09:48', bg: '#FDECC4' },
  { id: 5, youtubeId: null, title: '100 ta eng kerakli fe’l', cat: 'Ingliz tili', k: 'en', level: 'A2', dur: '22:10', bg: '#DCE3FB' },
  { id: 6, youtubeId: null, title: 'Kasrlarni qo‘shish va ayirish', cat: 'Matematika', k: 'math', level: '5-sinf', dur: '11:40', bg: '#D6EFE3' },
  { id: 7, youtubeId: null, title: 'Writing Task 2: reja tuzish', cat: 'IELTS', k: 'ielts', level: 'B2', dur: '16:25', bg: '#FDECC4' },
  { id: 8, youtubeId: null, title: 'Trigonometriya: birlik aylana', cat: 'Matematika', k: 'math', level: '10-sinf', dur: '20:15', bg: '#D6EFE3' },
];

const FILTERS = [{ value: 'all', label: 'Hammasi' }, { value: 'en', label: 'Ingliz tili' }, { value: 'math', label: 'Matematika' }, { value: 'ielts', label: 'IELTS' }, { value: 'saved', label: 'Saqlanganlar' }];

export default function Videos() {
  const { addXp, notify } = useApp();
  const [f, setF] = useState('all');
  const [current, setCurrent] = useState(VIDEOS[0]);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState([1, 3]);
  const [watched, setWatched] = useState([]);
  const [notes, setNotes] = useState({ 1: [['02:40', 'go → went, see → saw — eng ko‘p uchraydigan 10 ta fe’l'], ['04:55', 'Inkor: did not + fe’lning 1-shakli']] });
  const [draft, setDraft] = useState('');

  const list = f === 'all' ? VIDEOS : f === 'saved' ? VIDEOS.filter((v) => saved.includes(v.id)) : VIDEOS.filter((v) => v.k === f);
  const upNext = VIDEOS.filter((v) => v.id !== current.id && v.k === current.k).slice(0, 3);
  const isSaved = saved.includes(current.id);

  function select(v) { setCurrent(v); setPlaying(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function finish() {
    if (!watched.includes(current.id)) { setWatched([...watched, current.id]); addXp(20, 'video ko‘rildi'); }
  }
  function addNote(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setNotes({ ...notes, [current.id]: [...(notes[current.id] || []), ['05:12', draft.trim()]] });
    setDraft('');
  }

  return (
    <>
      <PageHead eyebrow="Videolar" title="YouTube’dan saralangan darslar" sub="Videolar platforma ichida ochiladi — ko‘rish tarixi, eslatmalar va XP saqlanadi.">
        <span className="pill-stat"><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)' }} />YouTube ulangan<span className="muted small" style={{ fontWeight: 400 }}>· 12 ta kanal</span></span>
      </PageHead>

      <div className="split">
        <section className="col-main" style={{ gap: 14, flexBasis: 560 }} aria-label="Hozir ko‘rilayotgan video">
          <div className="player">
            {current.youtubeId && playing ? (
              <iframe src={`https://www.youtube-nocookie.com/embed/${current.youtubeId}?autoplay=1&rel=0`} title={current.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
            ) : (
              <>
                <button type="button" onClick={() => setPlaying(true)} aria-label="Videoni ijro etish" style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--amber)', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" style={{ fill: 'var(--ink)' }}><path d="M8 5l12 7-12 7z" /></svg>
                </button>
                <span style={{ position: 'absolute', left: 16, top: 14, color: '#A9B4CC', fontSize: 13 }}>
                  {playing ? 'Demo: bu videoga youtubeId berilmagan (src/pages/Videos.jsx)' : 'YouTube pleyer'}
                </span>
              </>
            )}
          </div>
          <div className="row-wrap" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}><h2 className="h2" style={{ fontSize: 22 }}>{current.title}</h2><span className="muted">[Kanal nomi] · {current.cat} · {current.level}</span></div>
            <div className="row-wrap">
              <button className="btn ghost" type="button" aria-pressed={isSaved} onClick={() => { setSaved(isSaved ? saved.filter((x) => x !== current.id) : [...saved, current.id]); notify(isSaved ? 'Saqlanganlardan olib tashlandi' : 'Video saqlandi'); }}>
                <Icon name="bookmark" style={isSaved ? { fill: 'currentColor' } : undefined} />{isSaved ? 'Saqlangan' : 'Saqlash'}
              </button>
              <button className="btn ghost" type="button" onClick={finish} disabled={watched.includes(current.id)}>{watched.includes(current.id) ? 'Ko‘rildi ✓' : 'Ko‘rib bo‘ldim'}</button>
              <Link className="btn" to={'/ustoz-ai?q=' + encodeURIComponent(`“${current.title}” videosi bo‘yicha savolim bor`)}>Video bo‘yicha savol</Link>
            </div>
          </div>
          <form className="card stack" onSubmit={addNote}>
            <div className="between"><h3 className="h3">Mening eslatmalarim</h3><span className="muted xs">Vaqt belgilari bilan</span></div>
            {(notes[current.id] || []).map(([t, n], i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start' }}><span className="small" style={{ fontWeight: 600, color: 'var(--primary)', flex: 'none' }}>{t}</span><span>{n}</span></div>
            ))}
            <label className="field" style={{ borderStyle: 'dashed', borderColor: '#BCC8F6' }}>
              <span className="muted small" style={{ flex: 'none' }}>05:12</span><span className="sr">Eslatma</span>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Eslatma qo‘shing va Enter bosing…" />
            </label>
          </form>
        </section>

        <aside className="col-side" style={{ gap: 16 }}>
          <div className="card stack-sm" style={{ background: 'var(--primary-soft)', borderColor: '#BCC8F6' }}>
            <b>Videodan keyin mini-test</b>
            <span className="small">“Ko‘rib bo‘ldim” ni bosing — +20 XP. Keyin 5 ta savol chiqadi.</span>
            <Link to="/quiz" className="small" style={{ fontWeight: 600 }}>Testga o‘tish →</Link>
          </div>
          <h2 className="h3">Keyingi videolar</h2>
          {upNext.map((v) => (
            <button key={v.id} className="vid" type="button" onClick={() => select(v)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <span className="thumb" style={{ width: 140, flex: 'none', background: v.bg }}><span className="dur">{v.dur}</span></span>
              <span className="stack-sm" style={{ gap: 2, minWidth: 0 }}><b style={{ lineHeight: 1.3 }}>{v.title}</b><span className="muted xs">{v.cat}</span></span>
            </button>
          ))}
        </aside>
      </div>

      <section className="stack-lg" aria-label="Video katalog">
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <h2 className="h2">Katalog</h2>
          <Choice options={FILTERS} value={f} onChange={setF} label="Fan bo‘yicha saralash" />
        </div>
        {list.length === 0 && <p className="muted">Bu bo‘limda hozircha video yo‘q.</p>}
        <div className="grid" style={{ '--min': '240px', gap: 20 }}>
          {list.map((v) => (
            <button key={v.id} type="button" className="vid" onClick={() => select(v)}>
              <span className="thumb" style={{ background: v.bg }}>
                <span className="play"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ fill: 'var(--ink)' }}><path d="M8 5l12 7-12 7z" /></svg></span>
                <span className="dur">{v.dur}</span>
              </span>
              <b style={{ lineHeight: 1.35 }}>{v.title}</b>
              <span className="muted xs">[Kanal nomi] · {v.cat}{watched.includes(v.id) ? ' · ko‘rilgan' : ''}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
