import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import StoryArt from '../components/StoryArt.jsx';
import { storyById, STORIES, wordCount } from '../data/stories.js';
import { lookup, translation } from '../data/words.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';
import { speak, stopSpeaking } from '../lib/speech.js';

export default function StoryDetail() {
  const { id } = useParams();
  const s = storyById(id);
  const { addXp, completeStory, addMistake, recordAnswer, saveWord, savedWords, mark, storiesDone } = useApp();
  const { lang } = useT();
  const [showTr, setShowTr] = useState(true);
  const [playing, setPlaying] = useState(-1); // o'qilayotgan xatboshi
  const [rate, setRate] = useState(1);
  const [pop, setPop] = useState(null); // { word, entry, x, y }
  const [picked, setPicked] = useState({});
  const playRef = useRef({ stop: false });

  useEffect(() => () => { playRef.current.stop = true; stopSpeaking(); }, []);
  useEffect(() => { setPicked({}); setPlaying(-1); setPop(null); stopSpeaking(); }, [id]);
  const treasury = useMemo(() => (s ? s.words.map(lookup).filter(Boolean) : []), [s]);
  if (!s) return <div className="card stack"><h1 className="h1">Hikoya topilmadi</h1><Link className="btn" to="/darslar?tab=stories">Hikoyalarga qaytish</Link></div>;

  function playFrom(i) {
    playRef.current.stop = false;
    if (i >= s.paras.length) { setPlaying(-1); return; }
    setPlaying(i);
    speak(s.paras[i][0], { lang: 'en-US', rate, onEnd: () => { if (!playRef.current.stop) playFrom(i + 1); } });
  }
  function stop() { playRef.current.stop = true; stopSpeaking(); setPlaying(-1); }

  function wordClick(e, token) {
    const entry = lookup(token);
    const r = e.currentTarget.getBoundingClientRect();
    setPop({ word: token.replace(/[^A-Za-z’'-]/g, ''), entry, x: r.left + r.width / 2 + window.scrollX, y: r.bottom + window.scrollY + 6 });
  }

  const answered = Object.keys(picked).length;
  const correct = s.questions.filter((q, i) => picked[i] === q.a).length;

  function pick(qi, oi) {
    if (picked[qi] !== undefined) return;
    const q = s.questions[qi];
    const ok = oi === q.a;
    const next = { ...picked, [qi]: oi };
    setPicked(next);
    recordAnswer(ok);
    if (!ok) addMistake({ kind: 'reading', prompt: q.q, answer: q.opts[q.a], given: q.opts[oi], source: `Hikoya: ${s.title}`, options: q.opts });
    if (Object.keys(next).length === s.questions.length) {
      const c = s.questions.filter((qq, i) => next[i] === qq.a).length;
      const prev = storiesDone[s.id] ?? -1;
      completeStory(s.id, c);
      mark('story');
      if (c > prev) addXp(10 + c * 5, `${s.title} · ${c}/${s.questions.length}`);
    }
  }

  const idx = STORIES.findIndex((x) => x.id === s.id);
  const nextStory = STORIES[(idx + 1) % STORIES.length];

  return (
    <div onClick={(e) => { if (!e.target.closest('.tok, .word-pop')) setPop(null); }}>
      <nav className="crumbs"><Link to="/darslar?tab=stories">Tinglang va o‘qing</Link><span>/</span><span>{s.title}</span></nav>
      <div className="split">
        <div className="col-main">
          <section className="story-hero">
            <StoryArt art={s.art} color={s.color} height={240} />
            <div className="story-meta">
              <span className="row" style={{ gap: 6 }}><Icon name="clock" size={15} />Taxminan 1 daq o‘qish</span><span>{wordCount(s)} so‘z</span><span>{s.level} hikoyalari</span>
            </div>
          </section>

          <section className="card stack-lg" style={{ padding: 28, background: '#FFFDF8' }}>
            <div className="between" style={{ flexWrap: 'wrap' }}>
              <h1 className="h2 row" style={{ fontSize: 28, gap: 10 }}><Icon name="book" size={28} />{s.title} <span className="muted" style={{ fontWeight: 500, fontSize: 20 }}>/ {s.uz}</span></h1>
              <button type="button" className={'chip' + (showTr ? ' on' : '')} aria-pressed={showTr} onClick={() => setShowTr(!showTr)}><Icon name="globe" size={16} />Tarjima {showTr ? 'ochiq' : 'yopiq'}</button>
            </div>

            <div className="player-bar">
              <button type="button" className="play-btn" aria-label={playing >= 0 ? 'To‘xtatish' : 'Hikoyani tinglash'} onClick={() => (playing >= 0 ? stop() : playFrom(0))}>
                <Icon name={playing >= 0 ? 'pause' : 'play'} size={22} />
              </button>
              <div className="grow stack-sm" style={{ gap: 4 }}>
                <b>Hikoyani tinglang</b>
                <span className="muted xs">{s.paras.length} xatboshi · Inglizcha {playing >= 0 ? `· ${playing + 1}-xatboshi` : ''}</span>
                <div className="bar thin"><span style={{ width: `${playing < 0 ? 0 : ((playing + 1) / s.paras.length) * 100}%`, background: 'var(--green)' }} /></div>
              </div>
              <label className="stack-sm" style={{ gap: 2 }}><span className="muted xs">Tezlik</span>
                <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="select">
                  {[0.75, 1, 1.25].map((r) => <option key={r} value={r}>{r}×</option>)}
                </select>
              </label>
            </div>
            <p className="muted xs">Maslahat: tanish bo‘lmagan so‘zni bosing — tarjimasi chiqadi.</p>

            {s.paras.map(([en, uz], i) => (
              <div key={i} className={'para' + (playing === i ? ' now' : '')}>
                <span className="para-n">{String(i + 1).padStart(2, '0')}</span>
                <div className="grow stack-sm">
                  <p className="para-en">
                    {en.split(/(\s+)/).map((tok, k) => (/\s/.test(tok) ? tok : (
                      <button key={k} type="button" className="tok" onClick={(e) => wordClick(e, tok)}>{tok}</button>
                    )))}
                  </p>
                  {showTr && <p className="para-uz"><span className="tag" style={{ fontSize: 11, padding: '1px 6px', background: 'var(--green-soft)', color: 'var(--green-text)' }}>UZ</span> {uz}</p>}
                </div>
                <button type="button" className="iconbtn bare" aria-label={`${i + 1}-xatboshini tinglash`} onClick={() => { stop(); setPlaying(i); speak(en, { lang: 'en-US', rate, onEnd: () => setPlaying(-1) }); }}><Icon name="sound" /></button>
              </div>
            ))}
          </section>

          <section className="card stack-lg" style={{ padding: 28 }} aria-label="Savollar">
            <div className="between"><h2 className="h2">Tushundingizmi?</h2><span className="tag">{answered} / {s.questions.length}</span></div>
            {s.questions.map((q, qi) => {
              const p = picked[qi];
              return (
                <div key={qi} className="stack" style={{ paddingTop: qi ? 16 : 0, borderTop: qi ? '1px solid var(--line)' : 0 }}>
                  <div className="row"><span className="q-num">{qi + 1}</span><b style={{ fontSize: 18 }}>{q.q}</b></div>
                  {q.opts.map((o, oi) => {
                    const cls = p === undefined ? '' : oi === q.a ? ' right' : oi === p ? ' wrong' : '';
                    return (
                      <button key={o} type="button" className={'opt radio' + cls} disabled={p !== undefined} onClick={() => pick(qi, oi)}>
                        <span className="radio-dot" /><span className="grow">{o}</span>
                        {cls === ' right' && <span className="xs" style={{ color: 'var(--green-text)', fontWeight: 600 }}>✓ To‘g‘ri javob</span>}
                        {cls === ' wrong' && <span className="xs" style={{ color: 'var(--red)', fontWeight: 600 }}>✕ Sizning javobingiz</span>}
                      </button>
                    );
                  })}
                  {p !== undefined && (
                    <p className={'feedback ' + (p === q.a ? 'ok' : 'bad')} style={{ padding: '12px 16px' }}>
                      <Icon name={p === q.a ? 'tick' : 'book'} size={18} /><span><b>{p === q.a ? 'To‘g‘ri.' : 'Izoh:'}</b> {q.why}</span>
                    </p>
                  )}
                </div>
              );
            })}
            {answered === s.questions.length && (
              <div className="between card warm" style={{ flexWrap: 'wrap' }}>
                <b>Natija: {correct} / {s.questions.length}</b>
                <div className="row-wrap">
                  <button type="button" className="btn ghost" onClick={() => setPicked({})}>Qayta yechish</button>
                  <Link className="btn" to={`/hikoya/${nextStory.id}`}>Keyingi hikoya<Icon name="arrow" /></Link>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="col-side">
          <section className="card stack">
            <div className="row"><span className="feat-ic"><Icon name="book" /></span><div><h2 className="h3">So‘z xazinasi</h2><span className="muted xs">{treasury.length} ta yangi so‘z va ibora</span></div></div>
            {treasury.map((w) => (
              <div key={w.id} className="treasure">
                <div className="grow"><b>{w.en}</b><br /><span className="muted small">{translation(w, lang)}</span></div>
                <button type="button" className="iconbtn bare" aria-label={`${w.en} — tinglash`} onClick={() => speak(w.en, { lang: 'en-US' })}><Icon name="sound" size={18} /></button>
                <button type="button" className="act" disabled={savedWords.includes(w.en)} onClick={() => saveWord(w.en)}>{savedWords.includes(w.en) ? '✓' : '+'}</button>
              </div>
            ))}
          </section>
          <section className="card dark stack">
            <h2 className="h1" style={{ fontSize: 26, color: '#fff' }}>Kichik qadam, katta o‘sish.</h2>
            <p className="small dark-muted">Avval tinglang. Keyin matnni o‘zingiz o‘qing. Tushunmagan so‘zlaringizni bosib, tarjima bilan solishtiring.</p>
          </section>
        </aside>
      </div>

      {pop && (
        <div className="word-pop" role="dialog" aria-label={`${pop.word} tarjimasi`} style={{ left: pop.x, top: pop.y }}>
          <div className="between"><b style={{ fontSize: 18 }}>{pop.entry ? pop.entry.en : pop.word}</b>
            <button type="button" className="iconbtn bare" style={{ width: 32, height: 32 }} aria-label="Tinglash" onClick={() => speak(pop.entry?.en || pop.word, { lang: 'en-US' })}><Icon name="sound" size={16} /></button></div>
          {pop.entry
            ? <><span>{translation(pop.entry, lang)}</span><span className="muted xs">{pop.entry.level} · {pop.entry.pos}</span>
                <button type="button" className="btn sm" disabled={savedWords.includes(pop.entry.en)} onClick={() => saveWord(pop.entry.en)}>{savedWords.includes(pop.entry.en) ? 'Saqlangan' : 'So‘zlarimga qo‘shish'}</button></>
            : <><span className="muted small">Lug‘atda topilmadi.</span><Link className="btn ghost sm" to={'/ustoz-ai?q=' + encodeURIComponent(`“${pop.word}” so‘zining tarjimasi va ma’nosi`)}>Ustozdan so‘rash</Link></>}
        </div>
      )}
    </div>
  );
}
