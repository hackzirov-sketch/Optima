import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Avatar, Choice, PageHead, fmt } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

const PEOPLE = [
  ['JT', 'Jasur T.', 3840], ['MS', 'Madina S.', 3610], ['AR', 'Akmal R.', 3395],
  ['NY', 'Nilufar Y.', 3220], ['SB', 'Sardor B.', 3105], ['KM', 'Kamola M.', 2980],
  ['OU', 'Otabek U.', 2870], ['ZH', 'Zarina H.', 2795], ['BI', 'Bekzod I.', 2710],
  ['LA', 'Laylo A.', 2655], ['DN', 'Doniyor N.', 2600], ['SX', 'Sevara X.', 2535],
  ['MR', 'Muhammad R.', 2485],
];
const TRENDS = ['▲ 2', '▼ 1', '—', '▲ 4', '▼ 2', '▲ 1', '—', '▼ 3', '▲ 1', '—'];
const PERIODS = [{ value: 'week', label: 'Haftalik' }, { value: 'month', label: 'Oylik' }, { value: 'all', label: 'Barcha vaqt' }];
const SCOPES = [{ value: 'class', label: 'Sinf' }, { value: 'school', label: 'Maktab' }, { value: 'city', label: 'Shahar' }, { value: 'country', label: 'Respublika' }];
const MULT = { week: 1, month: 4.2, all: 19 };
const SCOPE_SIZE = { class: 0.35, school: 0.7, city: 1, country: 1.4 };

export default function Rating() {
  const { totalXp } = useApp();
  const [period, setPeriod] = useState('week');
  const [scope, setScope] = useState('city');
  const m = MULT[period] * SCOPE_SIZE[scope];

  // Foydalanuvchini ro'yxatga qo'shib, XP bo'yicha saralaymiz — XP oshsa o'rni ham o'zgaradi.
  const me = ['DK', 'Siz — Dilnoza K.', totalXp / SCOPE_SIZE[scope], true];
  const all = [...PEOPLE.map(([a, b, c]) => [a, b, c, false]), me].sort((x, y) => y[2] - x[2]);
  const myRank = all.findIndex((p) => p[3]) + 1;
  const ahead = all[myRank - 2];
  const top = all.slice(0, 3);
  const rows = all.slice(3, 12);

  const podium = [[top[1], 2, 64, 120, 'blue', '#BCC8F6', '#1A33A8'], [top[0], 1, 80, 170, 'amber', 'var(--amber)', 'var(--ink)'], [top[2], 3, 64, 90, 'green', '#A8DCC2', 'var(--green-ink)']];

  return (
    <>
      <PageHead eyebrow="Hamjamiyat" title="Reyting" sub="XP darslar, testlar, so‘z takrorlash va kunlik masalalar uchun beriladi.">
        <Choice variant="seg" options={PERIODS} value={period} onChange={setPeriod} label="Davr" />
        <Choice variant="seg" options={SCOPES} value={scope} onChange={setScope} label="Doira" />
      </PageHead>

      <div className="split">
        <div className="col-main">
          <section className="podium" aria-label="Eng yaxshi uchlik">
            {podium.map(([p, n, size, h, tone, bg, ink]) => (
              <div key={n}>
                {n === 1 && <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" style={{ fill: 'var(--amber)' }}><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg>}
                <Avatar initials={p[0]} tone={p[3] ? 'gold' : tone} size={size} style={n === 1 ? { boxShadow: '0 0 0 4px var(--amber)' } : undefined} />
                <b style={n === 1 ? { fontSize: 17 } : undefined}>{p[1]}</b>
                <span className="muted small">{fmt(p[2] * m)} XP</span>
                <div className="step" style={{ height: h, background: bg, color: ink, fontSize: n === 1 ? 48 : 40 }}>{n}</div>
              </div>
            ))}
          </section>

          <section className="card" style={{ padding: 8 }} aria-label="Reyting jadvali">
            <div className="row xs muted" style={{ padding: '12px 16px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}><span style={{ width: 32 }}>O‘rin</span><span className="grow">O‘quvchi</span><span>XP</span></div>
            <div>
              {rows.map((p, i) => (
                <div key={p[1]} className={'lb-row' + (p[3] ? ' you' : '')}>
                  <span style={{ width: 32, fontWeight: 700 }}>{i + 4}</span>
                  <Avatar initials={p[0]} tone={p[3] ? 'gold' : 'gray'} />
                  <span className="grow stack-sm" style={{ gap: 0, lineHeight: 1.3 }}><b>{p[1]}</b><span className="muted xs">[Maktab nomi] · 9-sinf</span></span>
                  <span className={'xs ' + (TRENDS[i]?.startsWith('▲') ? 'up' : TRENDS[i]?.startsWith('▼') ? 'down' : 'muted')} style={{ fontWeight: 600 }}>{TRENDS[i]}</span>
                  <b style={{ width: 80, textAlign: 'right' }}>{fmt(p[2] * m)}</b>
                </div>
              ))}
            </div>
            {myRank > 12 && (
              <>
                <div className="muted" style={{ textAlign: 'center', padding: '4px 0', letterSpacing: '.3em' }}>· · ·</div>
                <div className="lb-row you">
                  <span style={{ width: 32, fontWeight: 800 }}>{myRank}</span>
                  <Avatar initials="DK" tone="gold" />
                  <span className="grow stack-sm" style={{ gap: 0, lineHeight: 1.3 }}><b>Siz — Dilnoza K.</b><span className="xs" style={{ color: 'var(--amber-ink)' }}>{myRank - 1}-o‘ringa {fmt((ahead[2] - me[2]) * m + 1)} XP qoldi</span></span>
                  <b style={{ width: 80, textAlign: 'right' }}>{fmt(me[2] * m)}</b>
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="col-side">
          <section className="card dark stack">
            <span className="eyebrow" style={{ color: 'var(--amber)' }}>Sizning ligangiz</span>
            <h2 className="h2" style={{ fontSize: 24 }}>{myRank <= 10 ? 'Oltin liga' : 'Kumush liga'}</h2>
            <p className="small dark-muted">Hafta oxirida top-10 ga kirganlar Oltin ligaga ko‘tariladi. Hozir siz {myRank}-o‘rindasiz.</p>
            <div className="bar" style={{ background: '#33436B' }}><span style={{ width: `${Math.max(10, 100 - (myRank - 1) * 6)}%`, background: 'var(--amber)' }} /></div>
            <span className="small" style={{ color: '#DDE3F0' }}><Icon name="clock" size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Hafta tugashiga: 4 kun 6 soat</span>
          </section>
          <section className="card stack-sm" style={{ gap: 10 }}>
            <h2 className="h3">XP qanday yig‘iladi</h2>
            {[['Dars bosqichini tugatish', '+30'], ['Video ko‘rish', '+20'], ['Kunlik masala', '+15'], ['Test (har bir to‘g‘ri javob)', '+10'], ['So‘z o‘rganish', '+2']].map(([a, b]) => (
              <div key={a} className="between"><span>{a}</span><b>{b}</b></div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
