import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useApp } from '../store.jsx';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech.js';
import { buildDictionary, DICTIONARY_LEVELS, filterDictionary, lookupWord, PARTS } from '../lib/dictionary.js';
import '../dictionary.css';

const PER = 30;
const labels = { A1: 'Boshlang‘ich', A2: 'Asosiy', B1: 'O‘rta', B2: 'Yuqori o‘rta', C1: 'Ilg‘or', C2: 'Mukammal' };

export default function Dictionary() {
  const { saveWord, savedWords } = useApp();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const level = DICTIONARY_LEVELS.includes(params.get('level')) ? params.get('level') : 'all';
  const [words, setWords] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [pos, setPos] = useState('all');
  const [savedOnly, setSavedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState(null);
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [accent, setAccent] = useState('en-US');
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const entryRef = useRef(null);
  const listRef = useRef(null);
  useEffect(() => {
    let live = true;
    import('../data/cefr.json').then(data => { if (live) setWords(buildDictionary(data.default)); }).catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, []);
  const counts = useMemo(() => Object.fromEntries(DICTIONARY_LEVELS.map(key => [key, words.filter(word => word.level === key).length])), [words]);
  const results = useMemo(() => filterDictionary(words, { query: q, level, pos, savedOnly, savedWords }), [words, q, level, pos, savedOnly, savedWords]);
  const pages = Math.max(1, Math.ceil(results.length / PER));
  const safePage = Math.min(page, pages - 1);
  const shown = results.slice(safePage * PER, (safePage + 1) * PER);
  const current = results.find(word => word.id === selection) ?? shown[0];
  const key = current ? `${current.lookup}:${current.pos}` : '';
  const data = entry?.key === key ? entry.data : null;

  useEffect(() => { setPage(0); setSelection(null); }, [q, level, pos, savedOnly]);
  useEffect(() => {
    if (selection && window.matchMedia('(max-width: 680px)').matches) {
      entryRef.current?.scrollIntoView({ block: 'start' });
      entryRef.current?.focus({ preventScroll: true });
    }
  }, [selection]);
  useEffect(() => {
    setEntry(null); setError(''); setSpeechError(''); setSpeaking(false); stopSpeaking();
    if (!current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { controller.abort(); setError('Ulanish vaqti tugadi. Qayta urinib ko‘ring.'); }, 12000);
    lookupWord(current.lookup, current.pos, controller.signal).then(value => {
      if (!controller.signal.aborted) setEntry({ key, data: value });
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message || 'Internet aloqasini tekshiring.');
    }).finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); stopSpeaking(); };
  }, [key, retry]);

  function search(value, nextLevel = level) {
    setParams({ ...(value ? { q: value } : {}), ...(nextLevel !== 'all' ? { level: nextLevel } : {}) }, { replace: true });
  }
  function related(value) { setPos('all'); setSavedOnly(false); search(value, 'all'); }
  function backToList() {
    setSelection(null);
    requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ block: 'start' });
      listRef.current?.querySelector('button')?.focus({ preventScroll: true });
    });
  }
  function pronounce() {
    setSpeechError('');
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    if (!ttsSupported()) { setSpeechError('Bu brauzerda ovozli talaffuz mavjud emas.'); return; }
    setSpeaking(true);
    speak(current.lookup, { lang: accent, rate: 0.85, onEnd: () => setSpeaking(false), onError: () => setSpeechError('Talaffuzni ijro qilib bo‘lmadi. Qurilmangizdagi inglizcha ovozni tekshiring.') });
  }
  const relation = (items, title) => <div className="lex-relations"><h4>{title}</h4>{items.length ? <div>{items.slice(0, 18).map(word => <button key={word} type="button" onClick={() => related(word)}>{word}</button>)}</div> : <p>Manbada ko‘rsatilmagan.</p>}</div>;

  return <div className="dictionary-workspace">
    <header className="lex-heading"><div><span className="lex-kicker">ENGLISH · O‘ZBEKCHA</span><h1>Lug‘at</h1><p>So‘zni toping. Ma’nosini anglang. Talaffuzini tinglang.</p></div><span className="lex-total">{words.length.toLocaleString()}<small>so‘z va turkum yozuvi</small></span></header>
    <section className="lex-toolbar" aria-label="Lug‘at qidiruvi">
      <label className="lex-search"><Icon name="search" size={21} /><input type="search" aria-label="So‘z yoki tarjima qidirish" placeholder="Inglizcha so‘z yoki o‘zbekcha tarjima" value={q} onChange={event => search(event.target.value)} /></label>
      <div className="lex-levels" aria-label="CEFR darajalari"><div className="lex-level-heading"><h2>Darajalar</h2><button className="lex-all-levels" type="button" aria-pressed={level === 'all'} onClick={() => search(q, 'all')}><strong>Barchasi</strong><small>{words.length.toLocaleString()}</small></button></div><div className="lex-level-options">{DICTIONARY_LEVELS.map(value => <button key={value} type="button" data-band={value[0]} aria-pressed={level === value} onClick={() => search(q, value)}><span className="lex-level-symbol">{value}</span><span className="lex-level-name"><strong>{labels[value]}</strong><small>{counts[value]?.toLocaleString() ?? '0'} yozuv</small></span><span className="lex-level-check" aria-hidden="true"><Icon name="tick" size={14} /></span></button>)}</div></div>
      <div className="lex-filters"><label>So‘z turkumi<select value={pos} onChange={event => setPos(event.target.value)}><option value="all">Barchasi</option>{Object.entries(PARTS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="lex-saved"><input type="checkbox" checked={savedOnly} onChange={event => setSavedOnly(event.target.checked)} />Saqlanganlar</label><span aria-live="polite">{results.length.toLocaleString()} natija</span></div>
    </section>
    {loadError && <p role="alert">So‘zlar ro‘yxati yuklanmadi. Sahifani qayta ochib ko‘ring.</p>}
    {!loadError && !words.length && <p role="status">So‘zlar yuklanmoqda…</p>}
    {words.length > 0 && !results.length && <div className="lex-empty"><Icon name="search" size={32} /><h2>So‘z topilmadi</h2><p>Boshqa so‘z yozing yoki daraja va turkum filtrlarini o‘zgartiring.</p><button className="btn ghost" type="button" onClick={() => { search('', 'all'); setPos('all'); setSavedOnly(false); }}>Filtrlarni tozalash</button></div>}
    {current && <div className={`dictionary-browser${selection ? ' has-selection' : ''}`}>
      <section ref={listRef} className="dictionary-results" aria-label="Topilgan so‘zlar"><div className="lex-list-head">So‘zlar<span>{level === 'all' ? 'A1–C2' : level}</span></div><div className="lex-word-list">{shown.map(word => <button key={word.id} type="button" className={word.id === current.id ? 'is-selected' : ''} aria-pressed={word.id === current.id} onClick={() => setSelection(word.id)}><span><strong>{word.en}</strong><small>{word.uz || PARTS[word.pos] || word.pos}</small></span><span className="lex-badge">{word.level}</span></button>)}</div><div className="lex-pagination"><button type="button" aria-label="Oldingi sahifa" disabled={!safePage} onClick={() => { setPage(safePage - 1); setSelection(null); }}>←</button><span>{safePage + 1} / {pages}</span><button type="button" aria-label="Keyingi sahifa" disabled={safePage + 1 >= pages} onClick={() => { setPage(safePage + 1); setSelection(null); }}>→</button></div></section>
      <article ref={entryRef} tabIndex={-1} className="dictionary-entry" aria-label="So‘z tafsilotlari"><button className="lex-back" type="button" onClick={backToList}>← So‘zlar ro‘yxati</button><div className="lex-entry-top"><div><div className="lex-entry-meta"><span className="lex-badge">{current.level}</span><span>{PARTS[current.pos] || current.pos}</span></div><h2>{current.en}</h2>{data?.phonetic && <p className="lex-phonetic">{data.phonetic}</p>}</div><button className="lex-audio" type="button" aria-label={speaking ? 'Talaffuzni to‘xtatish' : 'Talaffuzni tinglash'} aria-pressed={speaking} onClick={pronounce}><Icon name="sound" size={25} /></button></div>
        <div className="lex-pronunciation"><span>Talaffuz</span><div role="group" aria-label="Talaffuz varianti">{[['en-US', 'Amerika'], ['en-GB', 'Britaniya']].map(([value, label]) => <button key={value} type="button" aria-pressed={accent === value} onClick={() => { stopSpeaking(); setSpeaking(false); setAccent(value); }}>{label}</button>)}</div></div>{speechError && <p className="lex-error" role="status">{speechError}</p>}
        <section className="lex-translation"><h3>O‘zbekcha</h3><p>{current.uz || 'Bu so‘zning o‘zbekcha tarjimasi hali kiritilmagan.'}</p>{current.ru && <small>RU · {current.ru}</small>}</section>
        <button className="lex-save" type="button" disabled={savedWords.includes(current.lookup)} onClick={() => saveWord(current.lookup)}><Icon name={savedWords.includes(current.lookup) ? 'tick' : 'bookmark'} size={18} />{savedWords.includes(current.lookup) ? 'So‘zlarimga saqlangan' : 'So‘zlarimga saqlash'}</button>
        <section className="lex-meanings" aria-label="Ma’no va bog‘liq so‘zlar" aria-busy={!data && !error}><h3>Ma’no va qo‘llanish</h3>{!data && !error && <p className="muted" role="status">Ochiq lug‘atdan izoh olinmoqda…</p>}{error && <div className="lex-error" role="status"><p>{error}</p><button className="btn ghost sm" type="button" onClick={() => setRetry(retry + 1)}>Qayta urinish</button></div>}{data?.meanings.map((meaning, index) => <div className="lex-sense" key={index}><span className="lex-pos">{PARTS[meaning.pos] || meaning.pos}</span><ol>{meaning.definitions.slice(0, 6).map((definition, i) => <li key={i}><p>{definition.text}</p>{definition.example && <blockquote>{definition.example}</blockquote>}</li>)}</ol></div>)}{data?.relations && <div className="lex-related-groups">{relation(data.relations.synonyms, 'Sinonimlar')}{relation(data.relations.antonyms, 'Antonimlar')}</div>}</section>
        <footer className="lex-sources"><span>Daraja: {current.source === 'cefrj' ? 'CEFR-J · Tono Laboratory, TUFS' : 'Octanove · CC BY-SA 4.0'}</span>{data && <><a href="https://dictionaryapi.dev/" target="_blank" rel="noreferrer">Izoh: Free Dictionary API ↗</a>{data.relations?.supplemented && <a href="https://www.datamuse.com/api/" target="_blank" rel="noreferrer">Sinonim va antonim: Datamuse ↗</a>}{data.sources.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">Asl manba ↗</a>)}{data.licenses.map(license => <a key={license.url} href={license.url} target="_blank" rel="noreferrer">{license.name} ↗</a>)}</>}</footer>
      </article>
    </div>}
    <details className="lex-credits"><summary>Lug‘at manbalari va litsenziyalar</summary><p>A1–B2: CEFR-J Wordlist 1.5, Yukio Tono, Tokyo University of Foreign Studies. C1–C2: Octanove Vocabulary Profile 1.0, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Daraja so‘z va turkumga tegishli; ayrim ma’nolar darajasi farq qilishi mumkin.</p><a href="https://github.com/openlanguageprofiles/olp-en-cefrj" target="_blank" rel="noreferrer">Open Language Profiles ↗</a><p>Tarjimalar OPTIMA bazasidan. Izohlar va bog‘liq so‘zlar internet orqali olinadi. Barcha so‘zlarda sinonim yoki antonim bo‘lishi shart emas.</p></details>
  </div>;
}
