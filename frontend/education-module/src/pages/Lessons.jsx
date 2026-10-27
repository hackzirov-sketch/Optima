import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import StoryArt from '../components/StoryArt.jsx';
import { Choice, PageHead } from '../components/ui.jsx';
import { LESSONS } from '../data/lessons.js';
import { STORIES } from '../data/stories.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';

export default function Lessons() {
  const { lessonsDone, storiesDone } = useApp();
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'stories' ? 'stories' : 'lessons';

  return (
    <>
      <PageHead title={t('nav.lessons')} sub={t('lessons.sub')}>
        <Choice variant="seg" label="Bo‘lim" value={tab} onChange={(v) => setParams(v === 'stories' ? { tab: v } : {}, { replace: true })}
          options={[{ value: 'lessons', label: t('lessons.tab1') }, { value: 'stories', label: t('lessons.tab2') }]} />
      </PageHead>

      {tab === 'lessons' ? (
        <section className="grid" style={{ '--min': '250px' }} aria-label="Grammatika darslari">
          {LESSONS.map((l) => {
            const score = lessonsDone[l.id];
            return (
              <Link key={l.id} to={`/darslar/${l.id}`} className="lesson-card">
                <span className="eyebrow" style={{ color: 'var(--primary)' }}>{l.id}-dars</span>
                <b className="lc-title">{l.title}</b>
                <div className="between" style={{ marginTop: 'auto' }}>
                  <span className="muted small">{l.words.length} so‘z · {l.exercises.length} mashq</span>
                  <span className={'tag ' + (score >= 80 ? 'done' : score ? 'progress' : '')}>{score >= 80 ? `${score}% ✓` : score ? `${score}%` : 'Boshlanmagan'}</span>
                </div>
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="grid" style={{ '--min': '280px', gap: 20 }} aria-label="Hikoyalar">
          {STORIES.map((s, i) => {
            const done = storiesDone[s.id];
            return (
              <article key={s.id} className="story-card">
                <div style={{ position: 'relative' }}>
                  <StoryArt art={s.art} color={s.color} height={170} />
                  <span className="story-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="story-lvl">{s.level}</span>
                </div>
                <div className="stack" style={{ padding: '16px 20px 20px', flex: 1 }}>
                  <div className="between muted xs"><span className="row" style={{ gap: 6 }}><Icon name="clock" size={15} />Taxminan 1 daq o‘qish</span><span>{s.questions.length} savol</span></div>
                  <h3 className="h2">{s.title}</h3>
                  <b style={{ color: 'var(--green-text)' }}>{s.uz}</b>
                  <p className="muted small">{s.blurb}</p>
                  <span className="muted xs row" style={{ gap: 6 }}><Icon name="book" size={15} />{done !== undefined ? `O‘qilgan · ${done}/${s.questions.length}` : 'Boshlashga tayyor'}</span>
                  <Link to={`/hikoya/${s.id}`} className="story-btn">Hikoyani o‘qish<Icon name="arrow" /></Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
