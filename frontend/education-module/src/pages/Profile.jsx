import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import TutorAvatar from '../components/TutorAvatar.jsx';
import LangSwitcher from '../components/LangSwitcher.jsx';
import { Avatar, Bar, Choice, Switch, fmt } from '../components/ui.jsx';
import { TUTORS, tutorById } from '../data/avatars.js';
import { LESSONS } from '../data/lessons.js';
import { useApp, today } from '../store.jsx';
import { useT } from '../i18n.jsx';

const SHADES = ['#E6EAF2', '#BCC8F6', '#7A90EC', '#2B4BE0'];

export default function Profile() {
  const app = useApp();
  const { profile, updateProfile, stats, totalXp, xpByDay, games, notify, resetData, session } = app;
  const { t } = useT();
  const [tab, setTab] = useState('overview');
  const [name, setName] = useState(profile.name);
  const [settings, setSettings] = useState({ notify: true, sound: true });
  const tutor = tutorById(profile.tutorId);
  const initials = (profile.name || 'O').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  const cells = useMemo(() => Array.from({ length: 140 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 139 + i);
    const xp = xpByDay[today(d)] || 0;
    return { xp, lvl: xp === 0 ? 0 : xp < 60 ? 1 : xp < 150 ? 2 : 3, date: today(d) };
  }), [xpByDay]);

  const ach = [
    { name: '7 kunlik olov', ic: 'flame', ok: stats.streak >= 7, tone: 'amber' },
    { name: '100 ta so‘z', ic: 'words', ok: stats.learnedCount >= 100, tone: 'blue' },
    { name: 'Birinchi dars', ic: 'book', ok: stats.lessonsDone >= 1, tone: 'green' },
    { name: 'Barcha darslar', ic: 'cap', ok: stats.lessonsDone >= LESSONS.length, tone: 'green' },
    { name: 'Kitobxon (3 hikoya)', ic: 'book', ok: stats.storiesDone >= 3, tone: 'amber' },
    { name: 'Matematik (5 bo‘lim)', ic: 'math', ok: stats.mathDone >= 5, tone: 'green' },
    { name: 'Bulut ustasi (150 ball)', ic: 'game', ok: games.best >= 150, tone: 'blue' },
    { name: 'Aniq nishon (90%)', ic: 'check', ok: stats.accuracy >= 90 && app.quiz.answered >= 20, tone: 'blue' },
  ];

  const report = `OPTIMA Ta’lim — haftalik hisobot\n${profile.name}, ${profile.grade}-sinf\n\n• Bu hafta: ${stats.weekXp} XP (kunlik maqsad ${profile.goalXp} XP)\n• Ketma-ketlik: ${stats.streak} kun\n• O‘rganilgan so‘zlar: ${stats.learnedCount}\n• Darslar: ${stats.lessonsDone}/${LESSONS.length}, hikoyalar: ${stats.storiesDone}, matematika bo‘limlari: ${stats.mathDone}\n• Javoblar aniqligi: ${stats.accuracy}%\n• Ishlanishi kerak bo‘lgan xatolar: ${stats.mistakes}`;

  function shareReport() {
    try {
      if (navigator.share) navigator.share({ title: 'OPTIMA hisobot', text: report });
      else { navigator.clipboard.writeText(report); notify('Hisobot nusxalandi — Telegram’ga yuboring'); }
    } catch { notify('Hisobotni nusxalab bo‘lmadi'); }
  }

  return (
    <>
      <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-label="Profil">
        <div className="cover"><svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 90 Q100 60 200 85 T400 70" stroke="#F4B32C" strokeWidth="2" fill="none" opacity=".5" /><path d="M0 105 Q120 80 220 100 T400 92" stroke="#2B4BE0" strokeWidth="2" fill="none" opacity=".7" /></svg></div>
        <div className="row-wrap" style={{ alignItems: 'flex-end', gap: 20, padding: '0 28px 24px', marginTop: -48, position: 'relative' }}>
          <Avatar initials={initials} tone="gold" size={112} style={{ border: '5px solid #fff', fontFamily: 'var(--font-display)' }} />
          <div style={{ flex: '1 1 280px', minWidth: 0, paddingBottom: 4 }}>
            <h1 className="h1">{profile.name || 'O‘quvchi'}</h1>
            <span className="muted">{profile.grade}-sinf · {session === 'demo' ? 'Demo hisob' : session} · ustoz: {tutor.name}</span>
          </div>
          <div className="row-wrap" style={{ paddingBottom: 4 }}>
            <button className="btn ghost" type="button" onClick={shareReport}><Icon name="report" />Ota-onaga hisobot</button>
          </div>
        </div>
      </section>

      <Choice variant="seg" value={tab} onChange={setTab} label="Profil bo‘limi" options={[{ value: 'overview', label: 'Umumiy' }, { value: 'tutor', label: 'Ustoz va til' }, { value: 'parent', label: 'Ota-ona hisoboti' }, { value: 'settings', label: 'Sozlamalar' }]} />

      {tab === 'overview' && (
        <>
          <section className="grid" style={{ '--min': '170px' }}>
            {[[fmt(totalXp), 'Jami XP'], [`${stats.streak} ${t('c.days')}`, t('home.streak')], [fmt(stats.learnedCount), t('home.words')], [`${stats.accuracy}%`, t('home.accuracy')], [`${stats.lessonsDone}/${LESSONS.length}`, t('home.lessons')]].map(([n, l]) => (
              <div key={l} className="card"><div className="num num-lg">{n}</div><span className="muted small">{l}</span></div>
            ))}
          </section>
          <div className="split">
            <section className="card stack col-main">
              <div className="between"><h2 className="h2">Faollik</h2><span className="muted small">So‘nggi 20 hafta</span></div>
              <div style={{ overflowX: 'auto' }}><div className="heat" role="img" aria-label="Kunlik faollik xaritasi">{cells.map((c) => <span key={c.date} style={{ background: SHADES[c.lvl] }} title={`${c.date}: ${c.xp} XP`} />)}</div></div>
              <div className="row muted xs" style={{ gap: 6 }}>Kam{SHADES.map((s) => <span key={s} style={{ width: 14, height: 14, borderRadius: 3, background: s }} />)}Ko‘p</div>
            </section>
            <section className="card stack col-side">
              <div className="between"><h2 className="h2">Yutuqlar</h2><span className="muted small">{ach.filter((a) => a.ok).length} / {ach.length}</span></div>
              <div className="grid" style={{ '--min': '120px', gap: 10 }}>
                {ach.map((a) => (
                  <div key={a.name} className={'ach' + (a.ok ? '' : ' locked')}>
                    <span className={'medal ' + (a.ok ? 'tone-' + a.tone : 'tone-gray')}><Icon name={a.ok ? a.ic : 'lock'} size={26} /></span>
                    <b className="xs">{a.name}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {tab === 'tutor' && (
        <div className="split">
          <section className="col-main stack">
            <h2 className="h2">{t('avatar.choose')}</h2>
            <div className="grid" style={{ '--min': '200px' }}>
              {TUTORS.map((tu) => (
                <article key={tu.id} className={'tutor-card' + (profile.tutorId === tu.id ? ' on' : '')}>
                  <div className="tutor-pic" style={{ background: tu.bg }}><TutorAvatar id={tu.id} size={150} /></div>
                  <div className="stack" style={{ padding: 16 }}>
                    <b className="h3">{tu.name}</b><span className="muted xs">{tu.role}</span>
                    <button type="button" className={'btn sm ' + (profile.tutorId === tu.id ? 'ghost' : 'ink')} onClick={() => updateProfile({ tutorId: tu.id })}>{profile.tutorId === tu.id ? 'Tanlangan' : 'Tanlash'}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <aside className="col-side card stack">
            <h2 className="h3">{t('c.language')}</h2>
            <p className="muted xs">Interfeys tili. Lug‘atda RU tanlansa, tarjimalar ruscha ko‘rsatiladi.</p>
            <div className="lang-inline"><LangSwitcher inline /></div>
          </aside>
        </div>
      )}

      {tab === 'parent' && (
        <section className="card stack-lg" style={{ maxWidth: 760 }}>
          <div className="row"><span className="feat-ic"><Icon name="report" /></span><div><h2 className="h2">Haftalik hisobot</h2><span className="muted small">Ota-ona yoki o‘qituvchiga bir tugma bilan yuboriladi</span></div></div>
          <pre className="report">{report}</pre>
          <div className="row-wrap"><button className="btn" type="button" onClick={shareReport}><Icon name="send" />Yuborish / nusxalash</button></div>
          <p className="muted xs">Haqiqiy loyihada hisobot har yakshanba Telegram bot orqali avtomatik yuboriladi.</p>
        </section>
      )}

      {tab === 'settings' && (
        <section className="card stack" style={{ maxWidth: 680 }}>
          <label className="stack-sm"><b>Ism</b>
            <span className="row"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" type="button" onClick={() => { updateProfile({ name: name.trim() || profile.name }); notify('Saqlandi'); }}>{t('c.save')}</button></span>
          </label>
          <div className="stack-sm"><b>Sinf</b><div className="row-wrap">{Array.from({ length: 11 }, (_, i) => i + 1).map((g) => <button key={g} type="button" className={'grade' + (profile.grade === g ? ' on' : '')} style={{ width: 44, height: 44, fontSize: 16 }} aria-pressed={profile.grade === g} onClick={() => updateProfile({ grade: g })}>{g}</button>)}</div></div>
          <div className="stack-sm"><b>Kunlik maqsad</b><Choice options={[50, 100, 150, 250].map((v) => ({ value: v, label: `${v} XP` }))} value={profile.goalXp} onChange={(v) => updateProfile({ goalXp: v })} label="Kunlik maqsad" /></div>
          <div className="set"><span className="grow">Eslatmalar</span><Switch checked={settings.notify} onChange={(v) => setSettings({ ...settings, notify: v })} label="Eslatmalar" /></div>
          <div className="set"><span className="grow">O‘yin ovozlari</span><Switch checked={settings.sound} onChange={(v) => setSettings({ ...settings, sound: v })} label="O‘yin ovozlari" /></div>
          <div className="set"><span className="grow">Ma’lumotlarni tiklash</span><button className="btn ghost sm" type="button" onClick={() => { resetData(); notify('Natijalar tiklandi'); }}>Tiklash</button></div>
          <div className="set"><span className="grow">Kunlik maqsad bajarilishi</span><Bar value={(stats.todayXp / (profile.goalXp || 100)) * 100} style={{ width: 160 }} /></div>
        </section>
      )}
    </>
  );
}
