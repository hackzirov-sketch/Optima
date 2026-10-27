import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Bar, Choice } from '../components/ui.jsx';
import { LESSONS, lessonById } from '../data/lessons.js';
import { lookup, translation } from '../data/words.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';
import { speak } from '../lib/speech.js';

const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '’').replace(/\s+/g, ' ').trim();

export default function LessonDetail() {
  const { id } = useParams();
  const L = lessonById(id);
  const { addXp, completeLesson, addMistake, recordAnswer, saveWord, savedWords, mark, lessonsDone, profile, updateProfile } = useApp();
  const { t, lang } = useT();
  const [tab, setTab] = useState('rule');
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);

  const words = useMemo(() => (L ? L.words.map(lookup).filter(Boolean) : []), [L]);
  useEffect(() => {
    if (L && profile.lastLessonId !== L.id) updateProfile({ lastLessonId: L.id });
  }, [L, profile.lastLessonId, updateProfile]);
  if (!L) return <div className="card stack"><h1 className="h1">Dars topilmadi</h1><Link className="btn" to="/darslar">Darslarga qaytish</Link></div>;

  const isRight = (ex, i) => (ex.type === 'choice' ? answers[i] === ex.a : ex.a.some((a) => norm(a) === norm(answers[i] || '')));
  const answeredCount = L.exercises.filter((_, i) => answers[i] !== undefined && answers[i] !== '').length;
  const score = Math.round((L.exercises.filter((ex, i) => isRight(ex, i)).length / L.exercises.length) * 100);
  const next = LESSONS.find((x) => x.id === L.id + 1);

  function check() {
    setChecked(true);
    L.exercises.forEach((ex, i) => {
      const ok = isRight(ex, i);
      recordAnswer(ok);
      if (!ok) addMistake({ kind: 'grammar', prompt: ex.q, answer: ex.type === 'choice' ? ex.opts[ex.a] : ex.a[0], given: ex.type === 'choice' ? (ex.opts[answers[i]] ?? '—') : (answers[i] || '—'), source: `${L.id}-dars: ${L.title}`, options: ex.type === 'choice' ? ex.opts : null });
    });
    const prev = lessonsDone[L.id] || 0;
    completeLesson(L.id, score);
    mark('lesson');
    if (score > prev) addXp(Math.round((score - prev) * 0.5) + 10, `${L.id}-dars · ${score}%`);
  }

  return (
    <>
      <nav className="crumbs"><Link to="/darslar">{t('nav.lessons')}</Link><span>/</span><span>{L.id}-dars</span></nav>
      <header className="page-head">
        <div className="title"><span className="eyebrow" style={{ color: 'var(--primary)' }}>{L.id}-dars · {L.level}</span><h1 className="h1">{L.title}</h1><p className="muted">{L.en}</p></div>
        <Choice variant="seg" label="Bo‘lim" value={tab} onChange={setTab} options={[{ value: 'rule', label: 'Qoida' }, { value: 'words', label: `So‘zlar (${words.length})` }, { value: 'ex', label: `Mashqlar (${L.exercises.length})` }]} />
      </header>

      {tab === 'rule' && (
        <div className="split">
          <section className="card col-main" style={{ gap: 20, padding: 28 }}>
            <p style={{ fontSize: 17 }}>{L.rule}</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="rule-table"><tbody>{L.table.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
            </div>
            <div className="panel row" style={{ alignItems: 'flex-start', background: 'var(--amber-soft)' }}><Icon name="bulb" style={{ color: '#B86A00' }} /><span>{L.tip}</span></div>
            <h2 className="h3">Misollar</h2>
            <ul className="examples">
              {L.examples.map(([en, uz]) => (
                <li key={en}>
                  <button type="button" className="iconbtn bare" aria-label="Tinglash" onClick={() => speak(en, { lang: 'en-US' })}><Icon name="sound" /></button>
                  <span className="grow"><b>{en}</b><br /><span className="muted small">{uz}</span></span>
                </li>
              ))}
            </ul>
            <div className="row-wrap"><button className="btn" type="button" onClick={() => setTab('words')}>So‘zlarga o‘tish<Icon name="arrow" /></button>
              <Link className="btn ghost" to={'/ustoz-ai?q=' + encodeURIComponent(`${L.en} mavzusini oddiy misollar bilan tushuntir`)}>Ustozdan so‘rash</Link></div>
          </section>
          <aside className="col-side">
            <section className="card stack"><h2 className="h3">Natija</h2>
              <span className="num num-lg">{lessonsDone[L.id] ?? 0}%</span><Bar value={lessonsDone[L.id] || 0} color="var(--green)" />
              <span className="muted xs">80% va undan yuqori — dars tugallangan hisoblanadi.</span>
            </section>
          </aside>
        </div>
      )}

      {tab === 'words' && (
        <section className="grid" style={{ '--min': '240px' }}>
          {words.map((w) => (
            <div key={w.id} className="card row" style={{ padding: 16 }}>
              <button type="button" className="iconbtn" aria-label={`${w.en} — tinglash`} onClick={() => speak(w.en, { lang: 'en-US' })}><Icon name="sound" /></button>
              <span className="grow"><b style={{ fontSize: 17 }}>{w.en}</b><br /><span className="muted small">{translation(w, lang)}</span></span>
              <button type="button" className="act" disabled={savedWords.includes(w.en)} onClick={() => saveWord(w.en)}>{savedWords.includes(w.en) ? '✓' : '+'}</button>
            </div>
          ))}
          <div className="card stack" style={{ justifyContent: 'center' }}><button className="btn" type="button" onClick={() => setTab('ex')}>Mashqlarga o‘tish<Icon name="arrow" /></button></div>
        </section>
      )}

      {tab === 'ex' && (
        <div className="split">
          <section className="col-main" style={{ gap: 14 }}>
            {L.exercises.map((ex, i) => {
              const ok = checked && isRight(ex, i);
              const bad = checked && !ok;
              return (
                <div key={i} className={'card stack ex' + (ok ? ' ok' : bad ? ' bad' : '')}>
                  <div className="row" style={{ alignItems: 'flex-start' }}><span className="q-num">{i + 1}</span><b className="grow" style={{ fontSize: 17 }}>{ex.q}</b></div>
                  {ex.type === 'choice' ? (
                    <div className="row-wrap">
                      {ex.opts.map((o, j) => (
                        <button key={o} type="button" disabled={checked} aria-pressed={answers[i] === j}
                          className={'chip' + (answers[i] === j ? ' on' : '') + (checked && j === ex.a ? ' right' : '')}
                          onClick={() => setAnswers({ ...answers, [i]: j })}>{o}</button>
                      ))}
                    </div>
                  ) : (
                    <label><span className="sr">Javob</span><input className="input" style={{ maxWidth: 320 }} disabled={checked} value={answers[i] || ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} placeholder="Javobni yozing" /></label>
                  )}
                  {checked && <p className="small">{ok ? <b style={{ color: 'var(--green-text)' }}>To‘g‘ri. </b> : <b style={{ color: 'var(--red)' }}>To‘g‘ri javob: {ex.type === 'choice' ? ex.opts[ex.a] : ex.a[0]}. </b>}{ex.why}</p>}
                </div>
              );
            })}
          </section>
          <aside className="col-side" style={{ position: 'sticky', top: 16 }}>
            <section className="card stack">
              <h2 className="h3">{checked ? 'Natija' : 'Jarayon'}</h2>
              <span className="num num-lg">{checked ? `${score}%` : `${answeredCount} / ${L.exercises.length}`}</span>
              <Bar value={checked ? score : (answeredCount / L.exercises.length) * 100} color={checked ? (score >= 80 ? 'var(--green)' : 'var(--amber)') : undefined} />
              {!checked
                ? <button className="btn" type="button" onClick={check} disabled={answeredCount === 0}>{t('c.check')}</button>
                : <>
                    <p className="small">{score >= 80 ? 'Ajoyib! Dars tugallandi.' : 'Xatolar “Xatolar daftari”ga qo‘shildi. Yana urinib ko‘ring.'}</p>
                    <button className="btn ghost" type="button" onClick={() => { setAnswers({}); setChecked(false); }}>{t('c.restart')}</button>
                    {next && <Link className="btn" to={`/darslar/${next.id}`} onClick={() => { setTab('rule'); setAnswers({}); setChecked(false); }}>{next.id}-dars<Icon name="arrow" /></Link>}
                  </>}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
