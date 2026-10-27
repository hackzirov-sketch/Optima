import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Choice, PageHead } from '../components/ui.jsx';
import { shuffle } from '../data/words.js';
import { checkAnswer } from '../data/math.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';

const KINDS = { word: 'So‘z', grammar: 'Grammatika', reading: 'O‘qish', math: 'Matematika' };
const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '’').trim();

export default function Mistakes() {
  const { mistakes, hitMistake, addXp, recordAnswer } = useApp();
  const { t } = useT();
  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState('list'); // list | review
  const [queue, setQueue] = useState([]);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [res, setRes] = useState(null);

  const list = useMemo(() => (filter === 'all' ? mistakes : mistakes.filter((m) => m.kind === filter)), [mistakes, filter]);
  const counts = Object.keys(KINDS).reduce((o, k) => ({ ...o, [k]: mistakes.filter((m) => m.kind === k).length }), {});

  function startReview() { setQueue(shuffle(list).slice(0, 10)); setI(0); setTyped(''); setRes(null); setMode('review'); }
  const m = queue[i];

  function check(val) {
    if (res || !m) return;
    const ok = m.kind === 'math' ? checkAnswer(val, [m.answer]) : norm(val) === norm(m.answer);
    setRes(ok ? 'ok' : 'bad');
    recordAnswer(ok);
    hitMistake(m.id, ok);
    if (ok) addXp(3, false);
  }
  function next() {
    if (i + 1 >= queue.length) { setMode('list'); return; }
    setI(i + 1); setTyped(''); setRes(null);
  }

  return (
    <>
      <PageHead eyebrow={t('grp.practice')} title={t('nav.mistakes')} sub="Darslar, hikoyalar, o‘yinlar va matematikadagi har bir xato shu yerga avtomatik yoziladi. Ketma-ket ikki marta to‘g‘ri javob bersangiz, xato daftardan o‘chadi.">
        {mode === 'list' && list.length > 0 && <button className="btn" type="button" onClick={startReview}><Icon name="play" />Xatolar ustida ishlash ({Math.min(10, list.length)})</button>}
      </PageHead>

      {mode === 'list' && (
        <>
          <Choice options={[{ value: 'all', label: `Hammasi (${mistakes.length})` }, ...Object.entries(KINDS).map(([k, v]) => ({ value: k, label: `${v} (${counts[k]})` }))]} value={filter} onChange={setFilter} label="Turi" />
          {list.length === 0 ? (
            <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: 40 }}>
              <Icon name="tick" size={44} style={{ color: 'var(--green)' }} />
              <h2 className="h2">Daftar bo‘sh — barakalla!</h2>
              <p className="muted">Mashq qilishda davom eting. Xato qilsangiz, u shu yerda paydo bo‘ladi.</p>
              <Link className="btn" to="/mashq">Mashqqa o‘tish</Link>
            </div>
          ) : (
            <section className="stack" aria-label="Xatolar">
              {list.map((x) => (
                <article key={x.id} className="card mistake">
                  <span className={'tag ' + (x.kind === 'math' ? 'done' : x.kind === 'word' ? 'current' : 'progress')}>{KINDS[x.kind]}</span>
                  <div className="grow stack-sm" style={{ gap: 2 }}>
                    <b>{x.prompt}</b>
                    <span className="small"><span style={{ color: 'var(--red)', textDecoration: 'line-through' }}>{x.given}</span> → <b style={{ color: 'var(--green-text)' }}>{x.answer}</b></span>
                    <span className="muted xs">{x.source} · {x.at}{x.hits ? ' · 1 marta to‘g‘ri' : ''}</span>
                  </div>
                  <Link className="btn ghost sm" to={'/ustoz-ai?q=' + encodeURIComponent(`Nega “${x.prompt}” savolida javob “${x.answer}”, “${x.given}” emas? Tushuntir.`)}>Nega?</Link>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {mode === 'review' && m && (
        <section className="card stack-lg" style={{ padding: 28, maxWidth: 720 }}>
          <div className="between"><span className="tag">{KINDS[m.kind]}</span><span className="muted">{i + 1} / {queue.length}</span></div>
          <h2 className="question">{m.prompt}</h2>
          {m.options ? (
            <div className="stack">
              {m.options.map((o) => {
                const cls = !res ? '' : norm(o) === norm(m.answer) ? ' right' : norm(o) === norm(typed) ? ' wrong' : '';
                return <button key={o} type="button" className={'opt' + cls} disabled={!!res} onClick={() => { setTyped(o); check(o); }}><span className="grow">{o}</span></button>;
              })}
            </div>
          ) : (
            <form className="row-wrap" onSubmit={(e) => { e.preventDefault(); if (!res) check(typed); else next(); }}>
              <label className="grow"><span className="sr">Javob</span><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!!res} autoFocus placeholder="Javobni yozing" /></label>
              {!res && <button className="btn" type="submit" disabled={!typed.trim()}>{t('c.check')}</button>}
            </form>
          )}
          {res && (
            <div className={'feedback ' + (res === 'ok' ? 'ok' : 'bad')}>
              <div className="grow"><b>{res === 'ok' ? t('c.correct') : `To‘g‘ri javob: ${m.answer}`}</b>{res === 'ok' && <span> {m.hits >= 1 ? 'Xato daftardan o‘chirildi.' : 'Yana bir marta to‘g‘ri topsangiz, o‘chadi.'}</span>}</div>
              <button className="btn" type="button" onClick={next} autoFocus>{i + 1 >= queue.length ? 'Tugatish' : t('c.next')}</button>
            </div>
          )}
          <button type="button" className="act" style={{ alignSelf: 'flex-start' }} onClick={() => setMode('list')}>Ro‘yxatga qaytish</button>
        </section>
      )}
    </>
  );
}
