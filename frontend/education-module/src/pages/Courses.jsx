import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Avatar, Choice, PageHead } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

const COURSES = [
  { id: 1, k: 'en', cat: 'Ingliz tili', title: 'General English: A2 dan B1 gacha', level: 'A2–B1', len: '4 oy', format: 'Onlayn', price: '[NARX] so‘m', ini: 'EN', tone: 'blue' },
  { id: 2, k: 'ielts', cat: 'IELTS', title: 'IELTS Writing: Task 1 va 2 ustaxonasi', level: 'B1+', len: '6 hafta', format: 'Onlayn', price: '[NARX] so‘m', ini: 'IE', tone: 'amber' },
  { id: 3, k: 'math', cat: 'Matematika', title: 'DTM matematika: to‘liq tayyorlov', level: '10–11-sinf', len: '8 oy', format: 'Oflayn · Toshkent', price: '[NARX] so‘m', ini: 'x²', tone: 'green' },
  { id: 4, k: 'it', cat: 'IT', title: 'Python: dasturlashga birinchi qadam', level: 'Boshlang‘ich', len: '3 oy', format: 'Onlayn', price: 'Bepul', ini: 'Py', tone: 'gray' },
  { id: 5, k: 'math', cat: 'Matematika', title: 'Olimpiada masalalari to‘garagi', level: '7–9-sinf', len: '5 oy', format: 'Gibrid', price: '[NARX] so‘m', ini: 'Σ', tone: 'green' },
  { id: 6, k: 'en', cat: 'Ingliz tili', title: 'Speaking Club: haftalik suhbatlar', level: 'A2+', len: 'Doimiy', format: 'Onlayn', price: 'Bepul', ini: 'SC', tone: 'blue' },
  { id: 7, k: 'it', cat: 'IT', title: 'Web dizayn asoslari', level: 'Boshlang‘ich', len: '2 oy', format: 'Onlayn', price: '[NARX] so‘m', ini: 'Wd', tone: 'gray' },
  { id: 8, k: 'ielts', cat: 'IELTS', title: 'Mock IELTS imtihoni', level: 'B1+', len: '1 kun', format: 'Oflayn · Toshkent', price: '[NARX] so‘m', ini: 'MK', tone: 'amber' },
];

const FILTERS = [{ value: 'all', label: 'Hammasi' }, { value: 'en', label: 'Ingliz tili' }, { value: 'ielts', label: 'IELTS' }, { value: 'math', label: 'Matematika' }, { value: 'it', label: 'IT' }, { value: 'free', label: 'Bepul' }];

export default function Courses() {
  const { notify } = useApp();
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [enrolled, setEnrolled] = useState([]);

  const list = COURSES
    .filter((c) => (f === 'all' ? true : f === 'free' ? c.price === 'Bepul' : c.k === f))
    .filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()));

  function enroll(c) {
    if (enrolled.includes(c.id)) return;
    setEnrolled([...enrolled, c.id]);
    notify(<>“{c.title}” — <b>ariza yuborildi</b></>);
  }

  return (
    <>
      <PageHead eyebrow="Tashqi kurslar" title="Hamkor o‘quv markazlari va onlayn kurslar" sub="OPTIMA’dagi natijalaringiz asosida sizga mos kurslar tavsiya qilinadi.">
        <label className="field" style={{ flex: '0 1 340px' }}><Icon name="search" /><span className="sr">Kurs qidirish</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kurs nomi" /></label>
      </PageHead>

      <section className="hero" aria-label="Tavsiya">
        <div className="stack" style={{ flex: '1 1 380px', minWidth: 0 }}>
          <span className="eyebrow" style={{ color: 'var(--amber)' }}>Siz uchun tavsiya</span>
          <h2 className="h1" style={{ fontSize: 28 }}>IELTS 6.5+ intensiv tayyorlov</h2>
          <p className="dark-muted">Ingliz tilida A2 → B1 o‘tishingiz va gapirish ko‘nikmangiz asosida tanlandi. [Hamkor nomi] · Toshkent, onlayn ham mavjud.</p>
          <div className="row-wrap"><span className="tag dark">3 oy</span><span className="tag dark">Haftasiga 3 dars</span><span className="tag dark">Sertifikat</span></div>
        </div>
        <div className="stack" style={{ alignItems: 'flex-start' }}>
          <span className="num" style={{ fontSize: 24 }}>[NARX] so‘m / oy</span>
          <span className="small dark-muted">OPTIMA foydalanuvchilariga [CHEGIRMA]% chegirma</span>
          <button className="btn amber" type="button" onClick={() => notify(<><b>Ariza yuborildi</b> — markaz siz bilan bog‘lanadi</>)}>Yozilish<Icon name="external" /></button>
        </div>
      </section>

      <Choice options={FILTERS} value={f} onChange={setF} label="Yo‘nalish" />

      {list.length === 0 && <p className="muted">Hech narsa topilmadi.</p>}
      <section className="grid" style={{ '--min': '280px', gap: 20 }} aria-label="Kurslar ro‘yxati">
        {list.map((c) => (
          <article key={c.id} className="course">
            <div className="row"><Avatar initials={c.ini} tone={c.tone} square /><span className="stack-sm" style={{ gap: 0, lineHeight: 1.3 }}><span className="muted xs">[Hamkor nomi]</span><span className="xs" style={{ fontWeight: 600 }}>{c.cat}</span></span></div>
            <h3 className="h2" style={{ fontSize: 18 }}>{c.title}</h3>
            <div className="row-wrap" style={{ gap: 6 }}><span className="tag">{c.level}</span><span className="tag">{c.len}</span><span className="tag">{c.format}</span></div>
            <div className="course-foot">
              <b style={{ color: c.price === 'Bepul' ? 'var(--green-text)' : 'var(--ink)' }}>{c.price}</b>
              <button className="btn ghost sm" type="button" onClick={() => enroll(c)} disabled={enrolled.includes(c.id)}>
                {enrolled.includes(c.id) ? 'Ariza yuborilgan ✓' : <>Yozilish<Icon name="external" size={16} /></>}
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="card warm row-wrap" style={{ gap: 16 }}>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}><h2 className="h2" style={{ fontSize: 18 }}>O‘quv markazimisiz?</h2><p style={{ marginTop: 4 }}>Kurslaringizni OPTIMA o‘quvchilariga taklif qiling — ariza ko‘rib chiqilgach katalogga qo‘shiladi.</p></div>
        <button className="btn ink" type="button" onClick={() => notify('Hamkorlik arizasi formasi tez orada')}>Hamkor bo‘lish</button>
      </section>
    </>
  );
}
