import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import TutorAvatar from '../components/TutorAvatar.jsx';
import { TUTORS } from '../data/avatars.js';
import { WORDS } from '../data/words.js';
import { LESSONS } from '../data/lessons.js';
import { STORIES } from '../data/stories.js';
import { totalChapters } from '../data/math.js';
import { useT } from '../i18n.jsx';
import { useApp } from '../store.jsx';

/* Boshqa platformalarda odatda bo'lmagan OPTIMA afzalliklari */
export const ADVANTAGES = [
  { icon: 'smile', title: 'Gapiradigan AI ustoz', text: 'Uchta avatar-ustoz (Kamron, Sardor, Malika) o‘zbek tilida ovoz bilan suhbatlashadi, savolni eshitadi va javob beradi.' },
  { icon: 'mic', title: 'Talaffuzni tekshirish', text: 'So‘zni mikrofonga ayting — tizim talaffuzingizni 100 ballik shkalada baholaydi.' },
  { icon: 'alert', title: 'Xatolar daftari', text: 'Har bir xato o‘yin, dars va matematikadan avtomatik yig‘iladi. Ikki marta to‘g‘ri javob bersangiz, daftardan chiqadi.' },
  { icon: 'translate', title: 'Bosib tarjima qilish', text: 'Hikoyadagi istalgan so‘zni bosing — tarjimasi, talaffuzi va “saqlash” tugmasi darhol chiqadi.' },
  { icon: 'globe', title: '8 tilda interfeys', text: 'O‘zbek, rus, ingliz, turk, qozoq, qirg‘iz, tojik va nemis tillarida — butun Markaziy Osiyo uchun.' },
  { icon: 'sparkle', title: 'Shaxsiy kunlik reja', text: 'Bugungi reja zaif joylaringiz, takrorlanadigan so‘zlar va xatolaringizdan avtomatik tuziladi.' },
  { icon: 'math', title: 'Cheksiz matematika misollari', text: `1–11-sinf, ${totalChapters} ta bo‘lim. Har safar yangi misol — yodlab olib bo‘lmaydi.` },
  { icon: 'report', title: 'Ota-ona hisoboti', text: 'Haftalik natija bir tugma bilan ota-onaga yuboriladi: XP, darslar, aniqlik va xatolar.' },
];

const COMPARE = [
  ['O‘zbek tilida ovozli AI ustoz', true, false],
  ['Ingliz tili + matematika 1–11 bitta joyda', true, false],
  ['Avtomatik xatolar daftari', true, false],
  ['Talaffuzni mikrofon orqali tekshirish', true, false],
  ['Hikoyada so‘zni bosib tarjima', true, 'ba’zan'],
  ['O‘yinlar va reyting', true, true],
  ['Ota-ona uchun haftalik hisobot', true, 'ba’zan'],
  ['8 ta interfeys tili', true, false],
];

export default function Landing() {
  const { t } = useT();
  const { auth } = useApp();
  return (
    <div className="landing">
      <header className="land-top">
        <Link className="brand" to="/" style={{ color: 'var(--ink)' }}><span className="logo">O</span><span>OPTIMA <em style={{ color: 'var(--primary)' }}>Ta’lim</em></span></Link>
        <div className="row-wrap">
          <Link className="btn ghost" to="/kirish">{t('c.login')}</Link>
          <Link className="btn" to="/royxat">{t('c.register')}</Link>
        </div>
      </header>

      <section className="land-hero">
        <div className="stack-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
          <span className="tag progress" style={{ alignSelf: 'flex-start' }}>Yangi · gapiradigan avatar-ustozlar</span>
          <h1 className="h1" style={{ fontSize: 'clamp(34px, 5vw, 56px)', lineHeight: 1.05 }}>{t('land.title')}</h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 560 }}>{t('land.sub')}</p>
          <div className="row-wrap" style={{ gap: 12 }}>
            <Link className="btn" to="/royxat" style={{ minHeight: 52, padding: '0 24px', fontSize: 16 }}>{t('land.cta')}<Icon name="arrow" /></Link>
            <button className="btn ghost" type="button" onClick={() => auth.demo()} style={{ minHeight: 52 }}>{t('auth.demo')}</button>
          </div>
          <div className="row-wrap muted small" style={{ gap: 18 }}>
            <span><b style={{ color: 'var(--ink)' }}>{WORDS.length}</b> so‘zlik lug‘at</span>
            <span><b style={{ color: 'var(--ink)' }}>{LESSONS.length}</b> grammatika darsi</span>
            <span><b style={{ color: 'var(--ink)' }}>{STORIES.length}</b> audio hikoya</span>
            <span><b style={{ color: 'var(--ink)' }}>11</b> sinf matematika</span>
          </div>
        </div>
        <div className="land-trio" aria-label="Avatar-ustozlar">
          {TUTORS.map((tu, i) => (
            <figure key={tu.id} className="trio-card" style={{ background: tu.bg, transform: i === 1 ? 'translateY(-18px)' : undefined }}>
              <TutorAvatar id={tu.id} size={150} state={i === 1 ? 'talking' : 'idle'} />
              <figcaption><b>{tu.name}</b><span>{tu.role}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="stack-lg">
        <div className="stack-sm" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="eyebrow" style={{ color: 'var(--primary)' }}>Nega OPTIMA?</span>
          <h2 className="h1" style={{ fontSize: 34 }}>Boshqa platformalarda bo‘lmagan imkoniyatlar</h2>
        </div>
        <div className="grid" style={{ '--min': '250px' }}>
          {ADVANTAGES.map((a) => (
            <article key={a.title} className="card stack">
              <span className="feat-ic"><Icon name={a.icon} size={22} /></span>
              <h3 className="h3">{a.title}</h3>
              <p className="muted small">{a.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-label="Taqqoslash">
        <div style={{ overflowX: 'auto' }}>
          <table className="compare">
            <thead><tr><th>Imkoniyat</th><th>OPTIMA Ta’lim</th><th>Odatiy o‘quv platformalar</th></tr></thead>
            <tbody>
              {COMPARE.map(([f, a, b]) => (
                <tr key={f}><td>{f}</td><td><Mark v={a} /></td><td><Mark v={b} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hero" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ flex: '1 1 360px' }}>
          <h2 className="h1" style={{ fontSize: 30 }}>Bugun 10 daqiqadan boshlang</h2>
          <p className="dark-muted">Ro‘yxatdan o‘ting, ustozingizni tanlang va birinchi suhbatni boshlang. Bepul.</p>
        </div>
        <Link className="btn amber" to="/royxat" style={{ minHeight: 52, padding: '0 24px' }}>{t('land.cta')}<Icon name="arrow" /></Link>
      </section>
      <footer className="muted small" style={{ textAlign: 'center', paddingBottom: 24 }}>© {new Date().getFullYear()} OPTIMA Ta’lim · Toshkent</footer>
    </div>
  );
}

function Mark({ v }) {
  if (v === true) return <span className="yes"><Icon name="tick" size={18} />Bor</span>;
  if (v === false) return <span className="no">—</span>;
  return <span className="muted small">{v}</span>;
}
