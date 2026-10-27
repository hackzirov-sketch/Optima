import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Avatar, Choice, PageHead } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

const CATS = { en: 'Ingliz tili', math: 'Matematika', tips: 'Maslahatlar', idea: 'Platformaga taklif' };
const TAG = { en: 'tone-blue', math: 'tone-green', tips: 'tone-amber', idea: 'tone-ink' };

const INITIAL = [
  { id: 1, ini: 'MS', tone: 'blue', name: 'Madina S.', meta: '9-sinf · 2 soat oldin', cat: 'tips', text: 'So‘z yodlashda menga eng ko‘p yordam bergan usul: har kuni 10 ta yangi so‘z + kechqurun 5 daqiqa takrorlash. Bir oyda 300 dan ortiq so‘z bo‘ldi!', likes: 42, comments: [{ who: 'Akmal R.', text: 'Men ham sinab ko‘raman, rahmat!' }] },
  { id: 2, ini: 'AR', tone: 'green', name: 'Akmal R.', meta: '10-sinf · 5 soat oldin', cat: 'math', text: 'Kvadrat tenglamada Viyet teoremasini qachon ishlatish qulayroq? Diskriminant bilan yechsam ko‘p vaqt ketyapti.', likes: 17, comments: [{ who: 'Nilufar Y.', text: 'a = 1 bo‘lsa va ildizlar butun son bo‘lsa — Viyet tezroq.' }] },
  { id: 3, ini: 'NY', tone: 'amber', name: 'Nilufar Y.', meta: '11-sinf · kecha', cat: 'en', text: 'IELTS Speaking’ga tayyorlanyapman. Ustoz AI bilan har kuni 10 daqiqa gaplashish juda foydali bo‘ldi — talaffuzim ancha yaxshilandi.', likes: 31, comments: [] },
  { id: 4, ini: 'SB', tone: 'gray', name: 'Sardor B.', meta: '8-sinf · kecha', cat: 'idea', text: 'Taklif: quiz’da do‘stlar bilan jamoa bo‘lib bellashish rejimi qo‘shilsa zo‘r bo‘lardi.', likes: 56, comments: [] },
];

const SUGGESTIONS = [['Tungi rejim', 128], ['Fizika va kimyo bo‘limlari', 96], ['Offlayn rejimda so‘z takrorlash', 71]];

export default function Community() {
  const { notify } = useApp();
  const [posts, setPosts] = useState(INITIAL);
  const [filter, setFilter] = useState('all');
  const [postCat, setPostCat] = useState('tips');
  const [draft, setDraft] = useState('');
  const [liked, setLiked] = useState({});
  const [saved, setSaved] = useState({});
  const [openComments, setOpenComments] = useState(null);
  const [comment, setComment] = useState('');
  const [votes, setVotes] = useState({});

  const list = filter === 'all' ? posts : posts.filter((p) => p.cat === filter);

  function publish(e) {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setPosts([{ id: Date.now(), ini: 'DK', tone: 'gold', name: 'Dilnoza Karimova', meta: '9-sinf · hozirgina', cat: postCat, text: t, likes: 0, comments: [] }, ...posts]);
    setDraft('');
    notify('Fikringiz joylandi');
  }
  function addComment(e, id) {
    e.preventDefault();
    if (!comment.trim()) return;
    setPosts(posts.map((p) => (p.id === id ? { ...p, comments: [...p.comments, { who: 'Siz', text: comment.trim() }] } : p)));
    setComment('');
  }

  return (
    <>
      <PageHead eyebrow="Hamjamiyat" title="Fikrlar" sub="Tajriba, maslahat va savollaringizni bo‘lishing. Platforma haqidagi takliflar alohida bo‘limda." />

      <div className="split">
        <div className="col-main" style={{ gap: 16 }}>
          <form className="card stack" onSubmit={publish} aria-label="Yangi fikr">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar initials="DK" tone="gold" />
              <label className="grow"><span className="sr">Fikringiz</span>
                <textarea className="textarea" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Fikringizni bo‘lishing… Masalan, qaysi usul so‘z yodlashda yordam berdi?" maxLength={600} />
              </label>
            </div>
            <div className="row-wrap" style={{ paddingLeft: 52 }}>
              <span className="muted small">Bo‘lim:</span>
              <Choice options={Object.entries(CATS).map(([value, label]) => ({ value, label }))} value={postCat} onChange={setPostCat} label="Post bo‘limi" itemStyle={{ minHeight: 36 }} />
              <span className="muted xs" style={{ marginLeft: 'auto' }}>{draft.length}/600</span>
              <button className="btn" type="submit" disabled={!draft.trim()}>Joylash</button>
            </div>
          </form>

          <Choice options={[{ value: 'all', label: 'Hammasi' }, ...Object.entries(CATS).map(([value, label]) => ({ value, label }))]} value={filter} onChange={setFilter} label="Bo‘lim bo‘yicha saralash" />

          {list.length === 0 && <p className="muted">Bu bo‘limda hali fikr yo‘q. Birinchi bo‘ling!</p>}
          {list.map((p) => {
            const on = !!liked[p.id];
            return (
              <article key={p.id} className="card stack">
                <div className="row">
                  <Avatar initials={p.ini} tone={p.tone} />
                  <div className="grow stack-sm" style={{ gap: 0, lineHeight: 1.3 }}><b>{p.name}</b><span className="muted xs">{p.meta}</span></div>
                  <span className={'tag ' + TAG[p.cat]} style={{ fontSize: 12 }}>{CATS[p.cat]}</span>
                </div>
                <p className="pre">{p.text}</p>
                <div className="row-wrap" style={{ gap: 4, marginLeft: -12 }}>
                  <button className={'act' + (on ? ' liked' : '')} type="button" aria-pressed={on} onClick={() => setLiked({ ...liked, [p.id]: !on })}><Icon name="heart" size={18} />{p.likes + (on ? 1 : 0)}</button>
                  <button className="act" type="button" aria-expanded={openComments === p.id} onClick={() => { setOpenComments(openComments === p.id ? null : p.id); setComment(''); }}><Icon name="comment" size={18} />{p.comments.length} izoh</button>
                  <button className="act" type="button" aria-pressed={!!saved[p.id]} onClick={() => setSaved({ ...saved, [p.id]: !saved[p.id] })}><Icon name="bookmark" size={18} style={saved[p.id] ? { fill: 'currentColor' } : undefined} />{saved[p.id] ? 'Saqlangan' : 'Saqlash'}</button>
                </div>
                {openComments === p.id && (
                  <div className="panel stack">
                    {p.comments.map((c, i) => <div key={i} className="small"><b>{c.who}:</b> {c.text}</div>)}
                    <form className="row" onSubmit={(e) => addComment(e, p.id)}>
                      <label className="field grow"><span className="sr">Izoh</span><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Izoh yozing…" autoFocus /></label>
                      <button className="btn sm" type="submit" disabled={!comment.trim()}>Yuborish</button>
                    </form>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <aside className="col-side">
          <section className="card dark stack">
            <span className="eyebrow" style={{ color: 'var(--amber)' }}>Platformaga taklif</span>
            <h2 className="h2" style={{ fontSize: 19 }}>OPTIMA’ni birga yaxshilaymiz</h2>
            <p className="small dark-muted">Eng ko‘p ovoz olgan takliflar har oy jamoa tomonidan ko‘rib chiqiladi.</p>
            <div className="stack-sm">
              {SUGGESTIONS.map(([t, n]) => {
                const v = !!votes[t];
                return (
                  <button key={t} type="button" aria-pressed={v} onClick={() => setVotes({ ...votes, [t]: !v })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: v ? 'var(--ink-3)' : 'var(--ink-2)', border: v ? '1px solid var(--amber)' : '1px solid transparent', color: '#fff', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                    <b style={{ color: 'var(--amber)', width: 36 }}>{n + (v ? 1 : 0)}</b><span className="grow small">{t}</span><span className="xs dark-muted">{v ? 'Ovoz berildi' : 'Ovoz'}</span>
                  </button>
                );
              })}
            </div>
            <button className="btn amber" type="button" onClick={() => { setPostCat('idea'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Taklif yozish</button>
          </section>

          <section className="card stack">
            <h2 className="h3">Haftaning faol a’zolari</h2>
            {[['MS', 'blue', 'Madina S.', 14], ['AR', 'green', 'Akmal R.', 11], ['NY', 'amber', 'Nilufar Y.', 9]].map(([ini, tone, n, c]) => (
              <div key={n} className="row"><Avatar initials={ini} tone={tone} className="sm" /><span className="grow">{n}</span><span className="muted xs">{c} fikr</span></div>
            ))}
          </section>

          <section className="card stack-sm">
            <h2 className="h3">Qoidalar</h2>
            <span className="small">1. Bir-biringizni hurmat qiling.</span>
            <span className="small">2. Test javoblarini tarqatmang — yechish yo‘lini tushuntiring.</span>
            <span className="small">3. Reklama va spam o‘chiriladi.</span>
            <span className="muted xs">Har bir post moderatsiyadan o‘tadi.</span>
          </section>
        </aside>
      </div>
    </>
  );
}
