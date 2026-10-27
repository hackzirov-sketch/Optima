import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Bar } from '../components/ui.jsx';
import { GRADES, checkAnswer, makeProblems } from '../data/math.js';
import { useApp } from '../store.jsx';

export default function MathChapter() {
  const { grade, chapter } = useParams();
  const chapters = GRADES[grade];
  const c = chapters?.[chapter];
  const { addXp, completeMath, addMistake, recordAnswer, mark, mathDone } = useApp();
  const [problems, setProblems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const [hints, setHints] = useState({});

  function fresh() { if (c) { setProblems(makeProblems(c, 5)); setAnswers({}); setChecked(false); setHints({}); } }
  useEffect(fresh, [grade, chapter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return <div className="card stack"><h1 className="h1">Bo‘lim topilmadi</h1><Link className="btn" to="/matematika">Matematikaga qaytish</Link></div>;

  const ok = (i) => checkAnswer(answers[i] ?? '', problems[i].a.map(String));
  const score = problems.filter((_, i) => ok(i)).length;
  const key = `${grade}-${chapter}`;
  const idx = Number(chapter);

  function check() {
    setChecked(true);
    problems.forEach((p, i) => {
      const good = ok(i);
      recordAnswer(good);
      if (!good) addMistake({ kind: 'math', prompt: p.q, answer: String(p.a[0]), given: answers[i] || '—', source: `Matematika ${grade}-sinf: ${c.title}` });
    });
    const prev = mathDone[key] ?? -1;
    completeMath(key, score);
    mark('math');
    addXp(score * 5 + (score > prev ? 5 : 0), `${c.title} · ${score}/5`);
  }

  return (
    <>
      <nav className="crumbs"><Link to="/matematika">Matematika</Link><span>/</span><span>{grade}-sinf</span><span>/</span><span>{idx + 1}-bo‘lim</span></nav>
      <header className="page-head"><div className="title"><span className="eyebrow" style={{ color: 'var(--green-text)' }}>{grade}-sinf · {idx + 1}-bo‘lim</span><h1 className="h1">{c.title}</h1></div></header>

      <div className="split">
        <div className="col-main">
          <section className="card stack-lg" style={{ padding: 28 }}>
            <h2 className="h3">Nazariya</h2>
            <p style={{ fontSize: 17 }}>{c.theory}</p>
            <div className="formula-big">{c.formula}</div>
            <div className="panel stack-sm" style={{ background: 'var(--green-soft)' }}><b>Yechilgan misol</b><span>{c.example}</span></div>
            <Link className="btn ghost" style={{ alignSelf: 'flex-start' }} to={'/ustoz-ai?q=' + encodeURIComponent(`${grade}-sinf matematika: “${c.title}” mavzusini oddiy misol bilan tushuntir`)}>Ustoz AI bilan tushunish</Link>
          </section>

          <section className="card stack-lg" style={{ padding: 28 }}>
            <div className="between" style={{ flexWrap: 'wrap' }}><h2 className="h2">Mashq: 5 ta misol</h2><button className="btn ghost sm" type="button" onClick={fresh}><Icon name="refresh" />Yangi misollar</button></div>
            {problems.map((p, i) => {
              const good = checked && ok(i);
              return (
                <div key={i} className={'ex stack-sm' + (checked ? (good ? ' ok' : ' bad') : '')} style={{ padding: 16, borderRadius: 14, border: '1px solid var(--line)' }}>
                  <div className="row" style={{ alignItems: 'flex-start' }}><span className="q-num">{i + 1}</span><b className="grow" style={{ fontSize: 18 }}>{p.q}</b></div>
                  <div className="row-wrap">
                    <label><span className="sr">Javob</span><input className="input" style={{ maxWidth: 220 }} inputMode="decimal" disabled={checked} value={answers[i] || ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} placeholder="Javob" onKeyDown={(e) => { if (e.key === 'Enter' && !checked) check(); }} /></label>
                    {!checked && <button type="button" className="act" onClick={() => setHints({ ...hints, [i]: true })}>Maslahat</button>}
                    {checked && (good ? <span className="tag done">To‘g‘ri</span> : <span className="tag" style={{ background: 'var(--red-soft)', color: '#7C2D12' }}>Javob: {String(p.a[0])}</span>)}
                  </div>
                  {(hints[i] || (checked && !good)) && <p className="small muted">{p.hint}</p>}
                </div>
              );
            })}
            {!checked
              ? <button className="btn green" type="button" onClick={check} disabled={!Object.values(answers).some((v) => String(v).trim())}>Tekshirish</button>
              : <div className={'feedback ' + (score >= 4 ? 'ok' : 'bad')}><b className="grow">Natija: {score} / 5 {score >= 4 ? '— bo‘lim o‘zlashtirildi!' : '— xatolar daftarga yozildi.'}</b><button className="btn" type="button" onClick={fresh}>Yana mashq</button></div>}
          </section>
        </div>

        <aside className="col-side">
          <section className="card stack">
            <h2 className="h3">Eng yaxshi natija</h2>
            <span className="num num-lg">{mathDone[key] ?? 0} / 5</span>
            <Bar value={((mathDone[key] ?? 0) / 5) * 100} color="var(--green)" />
          </section>
          <section className="card stack-sm">
            <h2 className="h3">{grade}-sinf bo‘limlari</h2>
            {chapters.map((ch, i) => (
              <Link key={ch.title} to={`/matematika/${grade}/${i}`} className={'listlink' + (i === idx ? ' on' : '')} style={{ padding: 10 }}>
                <span className={'dot ' + (mathDone[`${grade}-${i}`] >= 4 ? 'done' : 'todo')} style={{ width: 24, height: 24, fontSize: 11 }}>{mathDone[`${grade}-${i}`] >= 4 ? <Icon name="tick" size={12} /> : i + 1}</span>
                <span className="grow small">{ch.title}</span>
              </Link>
            ))}
          </section>
          <section className="card warm stack-sm">
            <b>Rasmiy darslik</b>
            <span className="small">Bo‘lim matnini rasmiy elektron darslikdan qo‘shish uchun <code>src/data/math.js</code> dagi bo‘limga <code>pdf</code> havolasini yozing.</span>
          </section>
        </aside>
      </div>
    </>
  );
}
