import { useEffect, useRef, useState } from 'react';
import { LANGS, useT } from '../i18n.jsx';

/** Pastki o'ng burchakdagi til almashtirgich. inline=true — profil ichida ro'yxat ko'rinishida. */
export default function LangSwitcher({ inline = false }) {
  const { lang, setLang, langInfo, t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const list = (
    <ul className="lang-list" role="listbox" aria-label={t('c.language')}>
      {LANGS.map((l) => (
        <li key={l.code}>
          <button type="button" role="option" aria-selected={l.code === lang} className={l.code === lang ? 'on' : ''} onClick={() => { setLang(l.code); setOpen(false); }}>
            <span className="code">{l.short}</span><span className="grow">{l.name}</span>
            {l.code === lang && <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{ fill: 'none', stroke: 'var(--amber)', strokeWidth: 2.5 }}><path d="M5 12l4 4 10-10" /></svg>}
          </button>
        </li>
      ))}
    </ul>
  );

  if (inline) return list;

  return (
    <div className="lang-fab" ref={ref}>
      {open && list}
      <button type="button" className="lang-pill" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={t('c.language') + ': ' + langInfo.name}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>
        {langInfo.short}
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ fill: 'currentColor' }}><path d="M7 10l5 5 5-5z" /></svg>
      </button>
    </div>
  );
}
