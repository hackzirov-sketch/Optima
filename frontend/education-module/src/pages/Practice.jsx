import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { PageHead } from '../components/ui.jsx';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.jsx';
import { WORDS } from '../data/words.js';

export default function Practice() {
  const { games, stats } = useApp();
  const { t } = useT();
  const cards = [
    { to: '/mashq/bulutlar', title: t('game.clouds'), text: 'So‘z chiqadi — to‘g‘ri tarjimali bulutni tanlang. Taymer, yuraklar, yordam va savat.', tag: 'O‘yin', color: '#DDEFFA', ic: 'game', meta: `Rekord: ${games.best} ball` },
    { to: '/mashq/soz-testi?mode=en-uz', title: 'So‘z testi: EN → UZ', text: 'Inglizcha so‘zning o‘zbekcha tarjimasini 4 ta variantdan toping.', tag: 'Test', color: '#E8EDFC', ic: 'check', meta: `${WORDS.length} so‘zlik baza` },
    { to: '/mashq/soz-testi?mode=uz-en', title: 'So‘z testi: UZ → EN', text: 'O‘zbekcha so‘zning inglizchasini tanlang.', tag: 'Test', color: '#E9F6EF', ic: 'translate', meta: 'A1–C1' },
    { to: '/mashq/soz-testi?mode=listen', title: 'Tinglab topish', text: 'So‘zni eshiting va ma’nosini toping — tinglab tushunishni rivojlantiradi.', tag: 'Audio', color: '#FFF4DC', ic: 'headphones', meta: 'Ovozli' },
    { to: '/mashq/soz-testi?mode=spell', title: 'Imlo: yozib ko‘ring', text: 'Tarjimaga qarab inglizcha so‘zni harfma-harf yozing.', tag: 'Yozish', color: '#F8DDEB', ic: 'pen', meta: 'Qiyinroq' },
    { to: '/xatolar', title: t('nav.mistakes'), text: 'Barcha xatolaringiz bir joyda. Ikki marta to‘g‘ri javob bersangiz — daftardan o‘chadi.', tag: 'Takrorlash', color: '#FCEDE8', ic: 'alert', meta: `${stats.mistakes} ta xato` },
  ];
  return (
    <>
      <PageHead eyebrow={t('grp.practice')} title={t('nav.practice')} sub="Inglizcha so‘zlar bilan o‘yin va testlar. Har bir javob statistikangizga va reytingga qo‘shiladi." />
      <section className="grid" style={{ '--min': '280px', gap: 20 }}>
        {cards.map((c) => (
          <Link key={c.title} to={c.to} className="practice-card">
            <span className="pc-top" style={{ background: c.color }}><Icon name={c.ic} size={34} /><span className="tag" style={{ background: '#fff' }}>{c.tag}</span></span>
            <span className="stack-sm" style={{ padding: 20 }}>
              <b className="h3">{c.title}</b>
              <span className="muted small">{c.text}</span>
              <span className="between" style={{ marginTop: 8 }}><span className="muted xs">{c.meta}</span><span className="row small" style={{ gap: 6, fontWeight: 600, color: 'var(--primary)' }}>{t('c.start')}<Icon name="arrow" size={16} /></span></span>
            </span>
          </Link>
        ))}
      </section>
      <section className="card row-wrap" style={{ gap: 16 }}>
        <div className="grow"><h2 className="h3">Statistika</h2><p className="muted small">Aniqlik: <b>{stats.accuracy}%</b> · o‘yinlar: <b>{games.played}</b> · o‘rganilgan so‘zlar: <b>{stats.learnedCount}</b></p></div>
        <Link className="btn ghost" to="/sozlar">Kartochkalar bilan o‘rganish</Link>
      </section>
    </>
  );
}
