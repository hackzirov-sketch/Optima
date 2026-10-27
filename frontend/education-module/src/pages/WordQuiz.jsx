import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Bar, Choice } from '../components/ui.jsx';
import { TOPICS, distractors, sample, shuffle, translation } from '../data/words.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';
import { speak } from '../lib/speech.js';

const N = 10;
const MODES = [{ value: 'en-uz', label: 'EN → UZ' }, { value: 'uz-en', label: 'UZ → EN' }, { value: 'listen', label: 'Tinglab' }, { value: 'spell', label: 'Imlo' }];

function build(level, topic, mode, lang) {
  const f = (w) => w.pos !== 'phr' && (level === 'all' || w.level === level) && (topic === 'all' || w.topic === topic);
  let words = sample(N, f);
  if (words.length < 4) words = sample(N, (w) => w.pos !== 'phr');
  return words.map((w) => {
    const field = mode === 'uz-en' ? 'en' : lang === 'ru' ? 'ru' : 'uz';
    const opts = shuffle([w, ...distractors(w, 3, field)]);
    return { w, opts, field };
  });
}

export default function WordQuiz() {
  const [params, setParams] = useSearchParams();
  const { addXp, recordAnswer, addMistake, mark, learnWord } = useApp();
  const { t, lang } = useT();
  const mode = MODES.some((m) => m.value === params.get('mode')) ? params.get('mode') : 'en-uz';
  const [level, setLevel] = useState('A1');
  const [topic, setTopic] = useState('all');
  const [qs, setQs] = useState([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [typed, setTyped] = useState('');
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const restart = () => { setQs(build(level, topic, mode, lang)); setI(0); setPicked(null); setTyped(''); setScore(0); setDone(false); };
  useEffect(restart, [mode, level, topic, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = qs[i];
  useEffect(() => { if (q && mode === 'listen') speak(q.w.en, { lang: 'en-US' }); }, [q, mode]);

  const label = (w, field) => (field === 'en' ? w.en : translation(w, lang));
  const answered = picked !== null;
  const right = answered && (mode === 'spell' ? picked === 'ok' : picked === q.w.id);

  function answer(val) {
    if (answered || !q) return;
    const ok = mode === 'spell' ? val.trim().toLowerCase() === q.w.en.toLowerCase() : val === q.w.id;
    setPicked(mode === 'spell' ? (ok ? 'ok' : 'bad') : val);
    recordAnswer(ok);
    if (ok) { setScore((s) => s + 1); learnWord(q.w.id, 2); }
    else {
      learnWord(q.w.id, 0);
      addMistake({ kind: 'word', prompt: mode === 'uz-en' || mode === 'spell' ? translation(q.w, lang) : q.w.en, answer: mode === 'uz-en' || mode === 'spell' ? q.w.en : translation(q.w, lang), given: mode === 'spell' ? (val || '—') : label(q.opts.find((o) => o.id === val), q.field), source: 'So‘z testi' });
    }
  }
  function next() {
    if (i + 1 >= qs.length) {
      setDone(true); mark('game');
      addXp(score * 3 + 5, `So‘z testi · ${score}/${qs.length}`);
    } else { setI(i + 1); setPicked(null); setTyped(''); }
  }

  return (
    <>
      <nav className="crumbs"><Link to="/mashq">{t('nav.practice')}</Link><span>/</span><span>So‘z testi</span></nav>
      <header className="page-head">
        <div className="title"><h1 className="h1">So‘z testi</h1><p className="muted">Inglizcha so‘zlar · {N} savol</p></div>
        <Choice variant="seg" options={MODES} value={mode} onChange={(v) => setParams({ mode: v }, { replace: true })} label="Rejim" />
      </header>
      <div className="row-wrap" style={{ gap: 12 }}>
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value)} aria-label={t('c.level')}><option value="all">Barcha darajalar</option>{['A1', 'A2', 'B1', 'B2'].map((l) => <option key={l}>{l}</option>)}</select>
        <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={t('c.topic')}><option value="all">Barcha mavzular</option>{Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>

      <section className="card stack-lg" style={{ padding: 28, maxWidth: 760 }}>
        {!done && q && (
          <>
            <div className="between"><span className="muted">{TOPICS[q.w.topic]} · {q.w.level}</span><span className="muted">Savol {i + 1} / {qs.length}</span></div>
            <Bar value={((i + (answered ? 1 : 0)) / qs.length) * 100} />
            {mode === 'listen'
              ? <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start', minHeight: 56 }} onClick={() => speak(q.w.en, { lang: 'en-US' })}><Icon name="sound" size={24} />Qayta eshitish</button>
              : <h2 className="question">{mode === 'en-uz' ? q.w.en : translation(q.w, lang)}</h2>}
            <span className="muted">{mode === 'en-uz' || mode === 'listen' ? 'Tarjimasini tanlang' : mode === 'uz-en' ? 'Inglizchasini tanlang' : 'Inglizchasini yozing'}</span>

            {mode === 'spell' ? (
              <form className="row-wrap" onSubmit={(e) => { e.preventDefault(); if (!answered) answer(typed); else next(); }}>
                <label className="grow"><span className="sr">Javob</span><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={answered} autoFocus placeholder={`${q.w.en.length} harf`} autoComplete="off" autoCapitalize="off" spellCheck="false" /></label>
                {!answered && <button className="btn" type="submit" disabled={!typed.trim()}>{t('c.check')}</button>}
              </form>
            ) : (
              <div className="stack">
                {q.opts.map((o, k) => {
                  const cls = !answered ? '' : o.id === q.w.id ? ' right' : o.id === picked ? ' wrong' : '';
                  return <button key={o.id} type="button" className={'opt' + cls} disabled={answered} onClick={() => answer(o.id)}><span className="letter">{'ABCD'[k]}</span><span className="grow">{label(o, q.field)}</span></button>;
                })}
              </div>
            )}
            {answered && (
              <div className={'feedback ' + (right ? 'ok' : 'bad')}>
                <div className="grow"><b>{right ? t('c.correct') : `${t('c.wrong')}.`}</b> {q.w.en} — {translation(q.w, lang)}</div>
                <button type="button" className="iconbtn bare" aria-label="Tinglash" onClick={() => speak(q.w.en, { lang: 'en-US' })}><Icon name="sound" /></button>
                <button className="btn" type="button" onClick={next} autoFocus>{i + 1 >= qs.length ? 'Natija' : t('c.next')}</button>
              </div>
            )}
          </>
        )}
        {done && (
          <div className="stack-lg" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 0' }}>
            <Icon name="trophy" size={48} style={{ color: '#B86A00' }} />
            <h2 className="h1">{score} / {qs.length}</h2>
            <p className="muted">{score === qs.length ? 'Mukammal!' : 'Xato so‘zlar takrorlash ro‘yxatiga va xatolar daftariga qo‘shildi.'}</p>
            <div className="row-wrap" style={{ justifyContent: 'center' }}><button className="btn" type="button" onClick={restart}>{t('c.restart')}</button><Link className="btn ghost" to="/mashq/bulutlar">{t('game.clouds')}</Link></div>
          </div>
        )}
      </section>
    </>
  );
}
