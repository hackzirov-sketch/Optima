import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Bar, Choice, PageHead, fmt } from '../components/ui.jsx';
import { WORDS, TOPICS, POS, translation, shuffle } from '../data/words.js';
import { useApp, today } from '../store.jsx';
import { useT } from '../i18n.jsx';
import { listen, pronunciationScore, speak, sttSupported } from '../lib/speech.js';

const SOURCES = [{ value: 'due', label: 'Takrorlash' }, { value: 'new', label: 'Yangi so‘zlar' }, { value: 'saved', label: 'Saqlanganlar' }];

export default function Words() {
  const { learned, learnWord, savedWords, addXp, mark, stats, notify } = useApp();
  const { t, lang } = useT();
  const [source, setSource] = useState(stats.dueCount ? 'due' : 'new');
  const [topic, setTopic] = useState('all');
  const [level, setLevel] = useState('A1');
  const [deck, setDeck] = useState([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [session, setSession] = useState({ known: 0, seen: 0 });
  const [pron, setPron] = useState(null); // { state, heard, score }

  const pool = useMemo(() => {
    if (source === 'due') return WORDS.filter((w) => learned[w.id] && learned[w.id].due <= today());
    if (source === 'saved') return WORDS.filter((w) => savedWords.includes(w.en));
    return WORDS.filter((w) => !learned[w.id] && (topic === 'all' || w.topic === topic) && w.level === level);
  }, [source, topic, level, learned, savedWords]);

  // Faqat manba/filtr o'zgarganda yangi to'plam tuziladi (javob berganda emas)
  useEffect(() => { setDeck(shuffle(pool).slice(0, 10)); setI(0); setFlipped(false); setPron(null); }, [source, topic, level]); // eslint-disable-line react-hooks/exhaustive-deps

  const w = deck[i];
  const done = deck.length > 0 && i >= deck.length;

  function answer(q) {
    if (!w) return;
    learnWord(w.id, q);
    if (q === 2) addXp(2, false);
    setSession((s) => ({ known: s.known + (q === 2 ? 1 : 0), seen: s.seen + 1 }));
    setFlipped(false);
    setPron(null);
    setI(i + 1);
    mark('words');
    if (i + 1 === deck.length) notify(<><b>Sessiya tugadi!</b> {session.known + (q === 2 ? 1 : 0)} / {deck.length} so‘zni bildingiz</>);
  }

  function checkPron() {
    if (!w) return;
    setPron({ state: 'listen' });
    listen({
      lang: 'en-US',
      onResult: (heard, final) => { if (final) { const score = pronunciationScore(heard, w.en); setPron({ state: 'done', heard, score }); if (score >= 80) addXp(3, 'talaffuz'); } else setPron({ state: 'listen', heard }); },
      onError: () => setPron({ state: 'error' }),
      onEnd: () => setPron((p) => (p?.state === 'listen' ? { state: 'error' } : p)),
    });
  }

  const boxes = [0, 1, 2, 3, 4, 5, 6].map((b) => Object.values(learned).filter((x) => x.box === b).length);

  return (
    <>
      <PageHead eyebrow="Ingliz tili" title={t('nav.words')} sub={`Oraliq takrorlash (Leitner tizimi): bilgan so‘zingiz tobora kamroq, qiyini tez-tez qaytadi. Bazada ${WORDS.length} ta so‘z.`} />

      <section className="grid" style={{ '--min': '190px' }} aria-label="So‘zlar statistikasi">
        {[[stats.dueCount, 'Bugun takrorlash', 'var(--amber)'], [fmt(stats.learnedCount), 'O‘rganilgan', 'var(--green)'], [Object.keys(learned).length, 'Jami ko‘rilgan', 'var(--primary)'], [savedWords.length, 'Saqlangan', 'var(--ink)']].map(([n, l, c]) => (
          <div key={l} className="card row" style={{ gap: 14 }}><span style={{ width: 10, height: 44, borderRadius: 6, background: c }} /><div><div className="num num-lg">{n}</div><span className="muted small">{l}</span></div></div>
        ))}
      </section>

      <div className="split">
        <section className="col-main" style={{ gap: 16 }}>
          <div className="row-wrap" style={{ gap: 12 }}>
            <Choice variant="seg" options={SOURCES} value={source} onChange={setSource} label="Manba" />
            {source === 'new' && (
              <>
                <select className="select" value={level} onChange={(e) => setLevel(e.target.value)} aria-label={t('c.level')}>{['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => <option key={l}>{l}</option>)}</select>
                <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={t('c.topic')}>
                  <option value="all">Barcha mavzular</option>{Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </>
            )}
          </div>

          {deck.length === 0 && (
            <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: 40 }}>
              <Icon name="tick" size={40} style={{ color: 'var(--green)' }} />
              <h2 className="h2">{source === 'due' ? 'Bugun takrorlanadigan so‘z qolmadi!' : source === 'saved' ? 'Saqlangan so‘z yo‘q' : 'Bu filtrda yangi so‘z qolmadi'}</h2>
              <button className="btn" type="button" onClick={() => setSource('new')}>Yangi so‘zlar o‘rganish</button>
            </div>
          )}

          {w && (
            <>
              <div className="between"><span className="muted small">{TOPICS[w.topic]} · {w.level}</span><span className="muted small">{i + 1} / {deck.length}</span></div>
              <Bar value={(i / deck.length) * 100} />
              <button type="button" className={'flash' + (flipped ? ' back' : '')} onClick={() => setFlipped(!flipped)} aria-label="Kartochkani aylantirish">
                {!flipped ? (
                  <><span className="eyebrow" style={{ opacity: .7 }}>{POS[w.pos]}</span><span className="word">{w.en}</span><span className="small" style={{ opacity: .7, marginTop: 12 }}>Tarjimani ko‘rish uchun bosing</span></>
                ) : (
                  <><span className="tr">{translation(w, lang)}</span><span style={{ opacity: .8 }}>{lang === 'ru' ? w.uz : w.ru}</span></>
                )}
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                <button className="btn ghost" type="button" onClick={() => answer(0)} style={{ borderColor: '#E7B3A8', color: 'var(--red-ink)' }}>Bilmayman</button>
                <button className="btn ghost" type="button" onClick={() => answer(1)} style={{ borderColor: 'var(--amber-line)', color: '#8A5600' }}>Qiyin</button>
                <button className="btn green" type="button" onClick={() => answer(2)}>Bilaman</button>
              </div>
              <div className="card row-wrap" style={{ gap: 12, padding: 14 }}>
                <button className="btn ghost sm" type="button" onClick={() => speak(w.en, { lang: 'en-US' })}><Icon name="sound" />{t('c.listen')}</button>
                <button className="btn ghost sm" type="button" onClick={checkPron} disabled={!sttSupported() || pron?.state === 'listen'}><Icon name="mic" />Talaffuzni tekshirish</button>
                {pron?.state === 'listen' && <span className="small">Ayting: <b>{w.en}</b> {pron.heard ? `… “${pron.heard}”` : ''}</span>}
                {pron?.state === 'done' && <span className="small"><b style={{ color: pron.score >= 80 ? 'var(--green-text)' : pron.score >= 50 ? '#8A5600' : 'var(--red)' }}>{pron.score}/100</b> · eshitildi: “{pron.heard}”</span>}
                {pron?.state === 'error' && <span className="small muted">Ovoz eshitilmadi — mikrofonga ruxsat bering.</span>}
                {!sttSupported() && <span className="muted xs">Talaffuz tekshiruvi Chrome yoki Edge’da ishlaydi.</span>}
              </div>
            </>
          )}

          {done && (
            <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
              <Icon name="trophy" size={40} style={{ color: '#B86A00' }} />
              <h2 className="h2">Sessiya tugadi: {session.known} / {session.seen}</h2>
              <button className="btn" type="button" onClick={() => { setDeck(shuffle(pool).slice(0, 10)); setI(0); setSession({ known: 0, seen: 0 }); }}>Yana 10 ta</button>
            </div>
          )}
        </section>

        <aside className="col-side">
          <section className="card stack">
            <h2 className="h3">Takrorlash qutilari</h2>
            {boxes.slice(0, 7).map((n, b) => (
              <div key={b} className="row"><span style={{ width: 90 }} className="small">{b === 0 ? 'Yangi/xato' : `${b}-quti`}</span><Bar value={n ? Math.max(6, (n / Math.max(...boxes, 1)) * 100) : 0} color={b >= 4 ? 'var(--green)' : b >= 2 ? undefined : 'var(--amber)'} style={{ flex: 1 }} /><b style={{ width: 34, textAlign: 'right' }}>{n}</b></div>
            ))}
            <p className="muted xs">“Bilaman” — so‘z keyingi qutiga o‘tadi va 1→2→4→7→15→30 kundan keyin qaytadi. 2-qutidan boshlab “o‘rganilgan” hisoblanadi.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
