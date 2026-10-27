import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Choice, PageHead } from '../components/ui.jsx';
import { GRADES, totalChapters } from '../data/math.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';

export default function MathPage() {
  const { profile, mathDone } = useApp();
  const { t } = useT();
  const [grade, setGrade] = useState(profile.grade || 9);
  const chapters = GRADES[grade];
  const doneHere = chapters.filter((_, i) => mathDone[`${grade}-${i}`] >= 4).length;

  return (
    <>
      <PageHead eyebrow={`${totalChapters} ta bo‘lim · cheksiz misollar`} title={t('nav.math') + ' 1–11'} sub="Har bir sinf darsligining mundarijasi: qisqa nazariya, formula, yechilgan misol va har safar yangi mashqlar." />

      <section className="card stack">
        <div className="between" style={{ flexWrap: 'wrap' }}><h2 className="h2">Sinf</h2><span className="muted small">{doneHere} / {chapters.length} bo‘lim o‘zlashtirildi</span></div>
        <Choice variant="grade" label="Sinf" value={grade} onChange={setGrade} options={Array.from({ length: 11 }, (_, i) => ({ value: i + 1, label: i + 1, aria: `${i + 1}-sinf` }))} />
        <Bar value={(doneHere / chapters.length) * 100} color="var(--green)" />
      </section>

      <section className="stack">
        <h2 className="h2">{grade}-sinf darsligi — mundarija</h2>
        <div className="grid" style={{ '--min': '280px' }}>
          {chapters.map((c, i) => {
            const best = mathDone[`${grade}-${i}`];
            return (
              <Link key={c.title} to={`/matematika/${grade}/${i}`} className="topic">
                <div className="between"><span className="badge-n tone-green" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 16 }}>{i + 1}</span>
                  <span className={'tag ' + (best >= 4 ? 'done' : best !== undefined ? 'progress' : '')}>{best >= 4 ? `${best}/5 ✓` : best !== undefined ? `${best}/5` : 'Boshlanmagan'}</span></div>
                <b style={{ fontSize: 17, lineHeight: 1.3 }}>{c.title}</b>
                <span className="muted small">{c.theory}</span>
                <code className="formula-chip">{c.formula}</code>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
