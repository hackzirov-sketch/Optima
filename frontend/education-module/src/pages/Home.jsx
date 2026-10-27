import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import TutorAvatar from '../components/TutorAvatar.jsx';
import { Bar, fmt } from '../components/ui.jsx';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';
import { tutorById } from '../data/avatars.js';
import { WORDS, translation } from '../data/words.js';
import { LESSONS } from '../data/lessons.js';
import { STORIES } from '../data/stories.js';
import { GRADES } from '../data/math.js';
import { speak } from '../lib/speech.js';

const WD = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

function wordOfDay() {
  const pool = WORDS.filter((w) => ['A2', 'B1'].includes(w.level) && w.pos !== 'phr');
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  return pool[n % pool.length];
}

export default function Home() {
  const app = useApp();
  const { profile, stats, totalXp, lessonsDone, storiesDone, mathDone, saveWord, savedWords } = app;
  const { t, lang } = useT();
  const nav = useNavigate();
  const tutor = tutorById(profile.tutorId);
  const goal = profile.goalXp || 100;
  const max = Math.max(goal, ...stats.week.map((w) => w.xp));
  const w = wordOfDay();
  const nextLesson = LESSONS.find((l) => !lessonsDone[l.id]) || LESSONS[0];
  const resumeLesson = LESSONS.find((l) => l.id === profile.lastLessonId && !lessonsDone[l.id]) || nextLesson;
  const hasResume = resumeLesson.id === profile.lastLessonId && !lessonsDone[resumeLesson.id];
  const nextStory = STORIES.find((s) => !storiesDone[s.id]) || STORIES[0];
  const chapters = GRADES[profile.grade] || GRADES[9];
  const nextChapter = Math.max(0, chapters.findIndex((_, i) => !mathDone[`${profile.grade}-${i}`]));
  const first = (profile.name || '').split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech';

  const plan = [
    { kind: 'words', icon: 'words', text: stats.dueCount ? `${Math.min(stats.dueCount, 20)} ta so‘zni takrorlash` : 'Yangi so‘zlar o‘rganish', to: '/sozlar', xp: 20 },
    { kind: 'lesson', icon: 'book', text: `${nextLesson.id}-dars: ${nextLesson.title}`, to: `/darslar/${nextLesson.id}`, xp: 30 },
    { kind: 'math', icon: 'math', text: `Matematika: ${chapters[nextChapter].title}`, to: `/matematika/${profile.grade}/${nextChapter}`, xp: 25 },
    stats.mistakes
      ? { kind: 'mistakes', icon: 'alert', text: `${stats.mistakes} ta xato ustida ishlash`, to: '/xatolar', xp: 15 }
      : { kind: 'game', icon: 'game', text: 'Bulutlar o‘yini — 10 ta so‘z', to: '/mashq/bulutlar', xp: 20 },
    { kind: 'avatar', icon: 'mic', text: `${tutor.name} bilan 3 daqiqa gaplashish`, to: '/avatar', xp: 10 },
  ];
  const planDone = plan.filter((p) => stats.doneToday.includes(p.kind)).length;

  return (
    <>
      <header className="page-head" style={{ alignItems: 'center' }}>
        <div className="title">
          <h1 className="h1">{greet}, {first || t('home.hello')}!</h1>
          <p className="muted">Bugungi maqsad: {goal} XP</p>
        </div>
        <label className="field" style={{ flex: '0 1 320px' }}>
          <Icon name="search" /><span className="sr">{t('c.search')}</span>
          <input type="search" placeholder="So‘z qidiring: apple, kitob…" onKeyDown={(e) => { const v = e.currentTarget.value.trim(); if (e.key === 'Enter' && v) nav('/lugatlar?q=' + encodeURIComponent(v)); }} />
        </label>
        <span className="chip static" style={{ background: 'var(--amber-soft)', borderColor: 'var(--amber)', minHeight: 44 }} title={t('home.streak')}>
          <Icon name="flame" style={{ color: '#B86A00' }} /><b>{stats.streak}</b> {t('c.days')}
        </span>
      </header>

      <section className="learning-focus" aria-labelledby="continue-heading">
        <div className="learning-focus-copy">
          <div className="learning-focus-status"><Icon name="book" /><span>{hasResume ? 'Oxirgi ochilgan dars' : 'Keyingi dars'} · {resumeLesson.level}</span></div>
          <h2 id="continue-heading">{resumeLesson.title}</h2>
          <p className="muted">{resumeLesson.en}</p>
          <div className="learning-focus-actions">
            <Link className="btn" to={`/darslar/${resumeLesson.id}`}><Icon name="play" />{hasResume ? 'Davom ettirish' : 'Darsni boshlash'}</Link>
            <Link className="learning-text-link" to="/darslar">Barcha darslar <Icon name="arrow" /></Link>
          </div>
        </div>
        <div className="learning-tutor">
          <TutorAvatar id={tutor.id} size={48} state="idle" />
          <div><strong>{tutor.name}</strong><span className="muted small">AI ustoz</span></div>
          <Link className="iconbtn" to="/ustoz-ai" aria-label="AI ustozga yozish" title="AI ustozga yozish"><Icon name="chat" /></Link>
          <Link className="iconbtn" to="/avatar" aria-label="AI ustoz bilan gaplashish" title="AI ustoz bilan gaplashish"><Icon name="mic" /></Link>
        </div>
      </section>
      <nav className="learning-subjects" aria-label="Fanlar va mashqlar">
        {[['/darslar', 'book', 'Ingliz tili'], ['/matematika', 'math', 'Matematika'], ['/sozlar', 'words', 'So‘zlar'], ['/mashq', 'game', 'Mashqlar']].map(([to, icon, label]) => (
          <Link key={to} to={to}><Icon name={icon} /><span>{label}</span><Icon name="arrow" /></Link>
        ))}
      </nav>

      <div className="split">
        <div className="col-main">
          <section className="card stack-lg">
            <div className="between"><h2 className="h2">{t('home.plan')}</h2><span className="tag progress">{planDone} / {plan.length}</span></div>
            <Bar value={(planDone / plan.length) * 100} color="var(--green)" />
            <ul className="plan">
              {plan.map((p) => {
                const done = stats.doneToday.includes(p.kind);
                return (
                  <li key={p.kind} className={done ? 'done' : ''}>
                    <span className={'dot ' + (done ? 'done' : 'todo')}>{done ? <Icon name="tick" size={14} /> : <Icon name={p.icon} size={14} />}</span>
                    <span className="grow">{p.text}</span>
                    <span className="muted xs">+{p.xp} XP</span>
                    <Link className="btn ghost sm" to={p.to}>{done ? 'Yana' : t('c.start')}</Link>
                  </li>
                );
              })}
            </ul>
            <span className="muted xs">Reja har kuni so‘zlaringiz, darslaringiz va xatolaringizga qarab yangilanadi.</span>
          </section>

          <section className="card stack-lg">
            <div className="between"><h2 className="h2">{t('home.week')}</h2><span className="muted small">Jami {fmt(stats.weekXp)} XP</span></div>
            <div className="chart" role="img" aria-label={stats.week.map((d) => `${WD[d.wd]} ${d.xp} XP`).join(', ')}>
              {stats.week.map((d, i) => (
                <div key={d.date} className={'col' + (i === 6 ? ' today' : '')} title={`${d.xp} XP`}>
                  <span className="xs muted">{d.xp || ''}</span>
                  <i style={{ height: `${Math.max(3, (d.xp / max) * 100)}%`, background: d.xp >= goal ? 'var(--green)' : undefined }} />
                  <span className={i === 6 ? '' : 'muted'} style={{ fontSize: 13, fontWeight: i === 6 ? 700 : 400 }}>{WD[d.wd]}</span>
                </div>
              ))}
            </div>
            <span className="muted xs">Yashil ustun — kunlik maqsad bajarilgan kun.</span>
          </section>

          <section className="grid" style={{ '--min': '220px' }} aria-label="Natijalar">
            <Link to="/darslar" className="card mini-stat"><span className="muted small">{t('home.lessons')}</span><b className="num num-lg">{stats.lessonsDone}<span className="muted" style={{ fontSize: 16 }}> / {LESSONS.length}</span></b><Bar value={(stats.lessonsDone / LESSONS.length) * 100} /></Link>
            <Link to="/darslar?tab=stories" className="card mini-stat"><span className="muted small">O‘qilgan hikoyalar</span><b className="num num-lg">{stats.storiesDone}<span className="muted" style={{ fontSize: 16 }}> / {STORIES.length}</span></b><Bar value={(stats.storiesDone / STORIES.length) * 100} color="var(--amber)" /></Link>
            <Link to="/matematika" className="card mini-stat"><span className="muted small">Matematika bo‘limlari</span><b className="num num-lg">{stats.mathDone}</b><Bar value={(stats.mathDone / 66) * 100} color="var(--green)" /></Link>
          </section>
        </div>

        <div className="col-side">


          <section className="card stack">
            <span className="muted eyebrow">Bugungi so‘z</span>
            <div className="row-wrap" style={{ alignItems: 'baseline' }}><span className="num" style={{ fontSize: 30 }}>{w.en}</span><span className="tag">{w.level}</span></div>
            <b>{translation(w, lang)}</b>
            <div className="row-wrap">
              <button className="btn ghost sm" type="button" onClick={() => speak(w.en, { lang: 'en-US' })}><Icon name="sound" />{t('c.listen')}</button>
              <button className="btn ghost sm" type="button" disabled={savedWords.includes(w.en)} onClick={() => saveWord(w.en)}>{savedWords.includes(w.en) ? 'Saqlangan' : t('c.save')}</button>
              <Link className="btn ghost sm" to={'/ustoz-ai?q=' + encodeURIComponent(`“${w.en}” so‘zi bilan 3 ta oddiy gap tuz`)}>Misollar</Link>
            </div>
          </section>

          <section className="card stack">
            <div className="between"><h2 className="h3">Keyingi hikoya</h2></div>
            <Link to={`/hikoya/${nextStory.id}`} className="listlink" style={{ padding: 8 }}>
              <span className="subject" style={{ background: nextStory.color, color: '#fff', width: 44, height: 44, fontSize: 13 }}>{nextStory.level}</span>
              <span className="grow"><b>{nextStory.title}</b><br /><span className="muted xs">Hikoya · {nextStory.uz}</span></span><Icon name="arrow" />
            </Link>
          </section>

          <section className="card stack-sm">
            <div className="between"><h2 className="h3">Reyting</h2><Link to="/reyting" className="small" style={{ fontWeight: 600 }}>To‘liq</Link></div>
            <span className="muted small">Jami: <b style={{ color: 'var(--ink)' }}>{fmt(totalXp)} XP</b> · bu hafta {fmt(stats.weekXp)} XP</span>
          </section>
        </div>
      </div>
      <section className="grid" style={{ '--min': '200px' }} aria-label="Statistika">
        <div className="card stat">
          <span className="muted small">{t('home.todayXp')}</span>
          <span className="num num-xl">{stats.todayXp} <span className="muted" style={{ fontSize: 18, fontWeight: 500 }}>/ {goal}</span></span>
          <Bar value={(stats.todayXp / goal) * 100} color={stats.todayXp >= goal ? 'var(--green)' : undefined} />
          <span className="muted xs">{stats.todayXp >= goal ? 'Maqsad bajarildi!' : `Yana ${goal - stats.todayXp} XP qoldi`}</span>
        </div>
        <div className="card stat">
          <span className="muted small">{t('home.streak')}</span>
          <span className="num num-xl">{stats.streak} {t('c.days')}</span>
          <span className="muted xs">{stats.todayXp > 0 ? 'Bugun ham davom etdi' : 'Bugun mashq qiling — zanjir uzilmasin'}</span>
        </div>
        <div className="card stat">
          <span className="muted small">{t('home.words')}</span>
          <span className="num num-xl">{fmt(stats.learnedCount)}</span>
          <span className="muted xs">{stats.dueCount} ta bugun takrorlanadi · {savedWords.length} ta saqlangan</span>
        </div>
        <div className="card stat">
          <span className="muted small">{t('home.accuracy')}</span>
          <span className="num num-xl">{stats.accuracy}%</span>
          <span className="muted xs">{fmt(app.quiz.correct)} / {fmt(app.quiz.answered)} to‘g‘ri javob</span>
        </div>
      </section>
    </>
  );
}
