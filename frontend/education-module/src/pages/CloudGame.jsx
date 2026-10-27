import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Choice } from '../components/ui.jsx';
import { WORDS, TOPICS, distractors, sample, shuffle, translation } from '../data/words.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';
import { speak } from '../lib/speech.js';

const GOAL = 10;
const TIME = 10; // soniya
const MODES = [{ value: 'en-uz', label: 'EN → UZ' }, { value: 'uz-en', label: 'UZ → EN' }, { value: 'listen', label: 'Tinglab' }];

function makeRound(word, mode, lang) {
  const field = mode === 'uz-en' ? 'en' : lang === 'ru' ? 'ru' : 'uz';
  const wrong = distractors(word, 2, field);
  const opts = shuffle([word, ...wrong]).map((w) => ({ id: w.id, label: field === 'en' ? w.en : translation(w, lang) }));
  return { word, opts };
}

export default function CloudGame() {
  const { addXp, recordAnswer, addMistake, recordGame, mark, games } = useApp();
  const { t, lang } = useT();
  const [mode, setMode] = useState('en-uz');
  const [level, setLevel] = useState('A1');
  const [topic, setTopic] = useState('all');
  const [phase, setPhase] = useState('setup'); // setup | play | feedback | over
  const [list, setList] = useState([]);
  const [idx, setIdx] = useState(0);
  const [round, setRound] = useState(null);
  const [hearts, setHearts] = useState(3);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [left, setLeft] = useState(TIME);
  const [paused, setPaused] = useState(false);
  const [hint, setHint] = useState(1);
  const [hidden, setHidden] = useState(null);
  const [result, setResult] = useState(null); // { pick, ok }
  const timer = useRef();

  const start = () => {
    const pool = (w) => w.pos !== 'phr' && (level === 'all' || w.level === level) && (topic === 'all' || w.topic === topic);
    const picked = sample(GOAL, pool);
    const words = picked.length >= GOAL ? picked : sample(GOAL, (w) => w.pos !== 'phr');
    setList(words); setIdx(0); setHearts(3); setScore(0); setCorrect(0); setHint(1); setPaused(false);
    newRound(words[0]);
  };

  const newRound = (w) => {
    setRound(makeRound(w, mode, lang));
    setLeft(TIME); setHidden(null); setResult(null); setPhase('play');
    if (mode === 'listen') setTimeout(() => speak(w.en, { lang: 'en-US' }), 200);
  };

  const finish = useCallback((finalScore, finalCorrect) => {
    setPhase('over');
    recordGame(finalScore);
    mark('game');
    addXp(Math.max(5, Math.round(finalScore / 5)), `${t('game.clouds')} · ${finalCorrect}/${GOAL}`);
  }, [addXp, mark, recordGame, t]);

  const advance = useCallback((h, s, c) => {
    const nextIdx = idx + 1;
    if (h <= 0 || nextIdx >= list.length) { finish(s, c); return; }
    setIdx(nextIdx);
    newRound(list[nextIdx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, list, finish, mode, lang]);

  const choose = useCallback((opt) => {
    if (phase !== 'play' || paused || !round || opt?.id === hidden) return;
    const ok = opt && opt.id === round.word.id;
    setResult({ pick: opt?.id ?? null, ok });
    setPhase('feedback');
    recordAnswer(!!ok);
    let h = hearts, s = score, c = correct;
    if (ok) { s = score + 10 + Math.ceil(left); c = correct + 1; setScore(s); setCorrect(c); }
    else {
      h = hearts - 1; setHearts(h);
      addMistake({ kind: 'word', prompt: mode === 'uz-en' ? translation(round.word, lang) : round.word.en, answer: mode === 'uz-en' ? round.word.en : translation(round.word, lang), given: opt?.label || 'vaqt tugadi', source: t('game.clouds') });
    }
    timer.current = setTimeout(() => advance(h, s, c), ok ? 900 : 1500);
  }, [phase, paused, round, hidden, hearts, score, correct, left, mode, lang, recordAnswer, addMistake, advance, t]);

  // Taymer
  useEffect(() => {
    if (phase !== 'play' || paused) return undefined;
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 0.1)), 100);
    return () => clearInterval(id);
  }, [phase, paused]);
  useEffect(() => { if (phase === 'play' && left <= 0) choose(null); }, [left, phase, choose]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Klaviatura: 1 / 2 / 3, P — pauza
  useEffect(() => {
    const onKey = (e) => {
      if (phase !== 'play' || e.target.closest?.('input, select, textarea')) return;
      if (['1', '2', '3'].includes(e.key) && round) choose(round.opts[Number(e.key) - 1]);
      if (e.key.toLowerCase() === 'p') setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, round, choose]);

  function applyHint() {
    if (!hint || phase !== 'play' || !round) return;
    const wrong = round.opts.find((o) => o.id !== round.word.id);
    setHidden(wrong.id); setHint(0);
  }

  const promptLabel = mode === 'uz-en' ? 'Inglizcha tarjimasini toping' : mode === 'listen' ? 'Eshitgan so‘zingiz tarjimasini toping' : t('game.findUz');
  const prompt = round ? (mode === 'uz-en' ? translation(round.word, lang) : mode === 'listen' ? '' : round.word.en) : '';
  const pickIndex = round && result ? round.opts.findIndex((o) => o.id === (result.ok ? result.pick : round.word.id)) : -1;
  const stars = score >= 150 ? 3 : score >= 100 ? 2 : score >= 50 ? 1 : 0;

  if (phase === 'setup') {
    return (
      <>
        <nav className="crumbs"><Link to="/mashq">{t('nav.practice')}</Link><span>/</span><span>{t('game.clouds')}</span></nav>
        <section className="game-setup">
          <div className="stack-lg" style={{ flex: '1 1 340px' }}>
            <h1 className="h1">{t('game.clouds')}</h1>
            <p className="muted">So‘z chiqadi — uchta bulutdan to‘g‘ri tarjimani tanlang. Har so‘zga {TIME} soniya, 3 ta yurak va 1 ta yordam. Maqsad: {GOAL} ta so‘z.</p>
            <div className="stack-sm"><b>Rejim</b><Choice variant="seg" options={MODES} value={mode} onChange={setMode} label="Rejim" /></div>
            <div className="row-wrap" style={{ gap: 12 }}>
              <label className="stack-sm"><b>{t('c.level')}</b><select className="select" value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">Hammasi</option>{['A1', 'A2', 'B1', 'B2'].map((l) => <option key={l}>{l}</option>)}</select></label>
              <label className="stack-sm"><b>{t('c.topic')}</b><select className="select" value={topic} onChange={(e) => setTopic(e.target.value)}><option value="all">Barcha mavzular</option>{Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            </div>
            <button className="btn" type="button" onClick={start} style={{ minHeight: 52, alignSelf: 'flex-start', padding: '0 28px' }}><Icon name="play" />{t('c.start')}</button>
            <span className="muted small">Eng yaxshi natija: {games.best} ball · o‘ynalgan: {games.played} marta · bazada {WORDS.length} so‘z</span>
          </div>
          <div className="sky-mini" aria-hidden="true"><span className="cloud c1">olma</span><span className="cloud c2">stol</span><span className="cloud c3">bulut</span><Basket /></div>
        </section>
      </>
    );
  }

  return (
    <div className="game">
      <header className="game-top">
        <span className="game-goal"><Icon name="trophy" /></span>
        <span className="stack-sm" style={{ gap: 0 }}><span className="muted xs">Maqsad</span><b>{Math.min(idx + (phase === 'over' ? 0 : 1), GOAL)} <span className="muted small">/ {GOAL} so‘z</span></b></span>
        <div className="bar" style={{ flex: '1 1 160px', maxWidth: 360 }}><span style={{ width: `${(correct / GOAL) * 100}%`, background: '#9BCB3C' }} /></div>
        <span className="grow" />
        <span className="hearts" aria-label={`${hearts} ta yurak`}>{[0, 1, 2].map((i) => <Icon key={i} name="heartFill" size={24} style={{ color: i < hearts ? '#E46B7E' : '#E6EAF2' }} />)}</span>
        <span className="row" style={{ gap: 4, fontWeight: 700, fontSize: 18 }}><Icon name="star" style={{ color: '#E0A82E', fill: '#E0A82E' }} />{score}</span>
        <button type="button" className="iconbtn" aria-label={paused ? 'Davom etish' : 'Pauza'} onClick={() => setPaused(!paused)} disabled={phase === 'over'}><Icon name={paused ? 'play' : 'pause'} /></button>
        <button type="button" className="iconbtn" aria-label={t('c.restart')} onClick={start}><Icon name="refresh" /></button>
      </header>

      <section className="sky" aria-live="polite">
        <span className="sun" aria-hidden="true" />
        <span className="bg-cloud b1" aria-hidden="true" /><span className="bg-cloud b2" aria-hidden="true" />
        {phase !== 'over' && round && (
          <>
            <div className="timer"><Icon name="clock" size={18} /><b>{Math.ceil(left)}</b>s<div className="bar thin" style={{ width: 70, background: '#ffffff99' }}><span style={{ width: `${(left / TIME) * 100}%`, background: left < 3 ? '#E46B7E' : '#5E9E3A' }} /></div></div>
            <div className="prompt-card">
              <span className="muted small">{promptLabel}</span>
              {mode === 'listen'
                ? <button type="button" className="btn ghost" onClick={() => speak(round.word.en, { lang: 'en-US' })} style={{ margin: '6px auto' }}><Icon name="sound" />Qayta eshitish</button>
                : <b className="prompt-word">{prompt}</b>}
              <span className="muted xs">{TOPICS[round.word.topic]}</span>
            </div>
            <div className="clouds">
              {round.opts.map((o, i) => {
                const state = result ? (o.id === round.word.id ? ' right' : o.id === result.pick ? ' wrong' : ' dim') : '';
                return (
                  <button key={o.id} type="button" className={'cloud-btn' + state + (o.id === hidden ? ' gone' : '')} style={{ animationDelay: `${i * -1.3}s` }} onClick={() => choose(o)} disabled={phase !== 'play' || paused || o.id === hidden} aria-label={`${i + 1}: ${o.label}`}>
                    <span className="cloud-shape" aria-hidden="true" />
                    <span className="cloud-label">{o.label}</span>
                    <span className="cloud-num">{i + 1}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {paused && phase === 'play' && <div className="pause-veil"><b className="h2">Pauza</b><button className="btn" type="button" onClick={() => setPaused(false)}><Icon name="play" />Davom etish</button></div>}
        {phase === 'over' && (
          <div className="over-card">
            <div className="row" style={{ justifyContent: 'center', gap: 6 }}>{[1, 2, 3].map((s) => <Icon key={s} name="star" size={40} style={{ color: s <= stars ? '#E0A82E' : '#D5DBE6', fill: s <= stars ? '#E0A82E' : '#E6EAF2' }} />)}</div>
            <h2 className="h1">{hearts > 0 ? 'Barakalla!' : 'Yuraklar tugadi'}</h2>
            <p>{correct} / {GOAL} to‘g‘ri · <b>{score}</b> ball{score >= games.best && score > 0 ? ' · yangi rekord!' : ''}</p>
            <div className="row-wrap" style={{ justifyContent: 'center' }}>
              <button className="btn" type="button" onClick={start}><Icon name="refresh" />{t('c.restart')}</button>
              <button className="btn ghost" type="button" onClick={() => setPhase('setup')}>Sozlamalar</button>
              {correct < GOAL && <Link className="btn ghost" to="/xatolar">Xatolarni ko‘rish</Link>}
            </div>
          </div>
        )}
        <div className="hills" aria-hidden="true" />
        <div className="basket-wrap" style={{ left: pickIndex >= 0 ? `${[18, 50, 82][pickIndex]}%` : '18%' }}>
          {result?.ok && <span className="drop" />}
          <Basket happy={result?.ok} />
        </div>
      </section>

      <footer className="game-foot">
        <span className="row muted small" style={{ gap: 8 }}><Icon name="game" />To‘g‘ri bulutni bosing yoki <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> · <kbd>P</kbd> pauza</span>
        <button type="button" className="btn ghost sm" onClick={applyHint} disabled={!hint || phase !== 'play'}><Icon name="bulb" />{t('game.hint')} <span className="tag" style={{ fontSize: 11, padding: '1px 6px' }}>{hint}×</span></button>
      </footer>
    </div>
  );
}

function Basket({ happy }) {
  return (
    <svg viewBox="0 0 120 100" width="110" height="92" aria-hidden="true">
      <path d="M30 40q30-40 60 0" stroke="#8B5A2B" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M12 40h96l-12 52H24z" fill="#C88A4E" />
      <path d="M12 40h96v8H12z" fill="#A86E36" />
      {[30, 50, 70, 90].map((x) => <path key={x} d={`M${x} 48l-3 42`} stroke="#A86E36" strokeWidth="3" />)}
      <circle cx="46" cy="64" r="3.5" fill="#3A2416" /><circle cx="74" cy="64" r="3.5" fill="#3A2416" />
      <path d={happy ? 'M50 72q10 10 20 0' : 'M52 74q8 5 16 0'} stroke="#3A2416" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="38" cy="71" rx="5" ry="3" fill="#F08A8A" opacity=".6" /><ellipse cx="82" cy="71" rx="5" ry="3" fill="#F08A8A" opacity=".6" />
    </svg>
  );
}
