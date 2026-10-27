export function UstozAvatar({ size = 64, label, simple = false }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ flex: 'none' }} {...a11y}>
      <circle cx="32" cy="32" r="32" fill="#2B4BE0" />
      {!simple && <path d="M32 21v-7" stroke="#fff" strokeWidth="3" strokeLinecap="round" />}
      {!simple && <circle cx="32" cy="11" r="4" fill="#F4B32C" />}
      <rect x="13" y="21" width="38" height="31" rx="15" fill="#fff" />
      <circle cx="25" cy="35" r="4" fill="#111A2E" />
      <circle cx="39" cy="35" r="4" fill="#111A2E" />
      {!simple && <circle cx="19" cy="42" r="3" fill="#F9D57E" />}
      {!simple && <circle cx="45" cy="42" r="3" fill="#F9D57E" />}
      <path d="M27 43c3 3 7 3 10 0" stroke="#111A2E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Avatar({ initials, tone = 'gray', size, square = false, className = '', style }) {
  const s = size ? { width: size, height: size, fontSize: Math.round(size / 3.2), ...style } : style;
  return <span className={`ava tone-${tone} ${square ? 'square' : ''} ${className}`} style={s}>{initials}</span>;
}

export function Bar({ value, color, thin = false, style }) {
  return (
    <div className={'bar' + (thin ? ' thin' : '')} style={style}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

/** Tanlov guruhi: chip, tab, seg yoki grade ko'rinishida */
export function Choice({ options, value, onChange, variant = 'chip', label, className = '', itemStyle }) {
  const isSeg = variant === 'seg';
  return (
    <div className={isSeg ? 'seg' : 'row-wrap ' + className} role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        const cls = isSeg ? (on ? 'on' : '') : `${variant}${on ? ' on' : ''}`;
        return (
          <button key={o.value} type="button" className={cls} aria-pressed={on} aria-label={o.aria} onClick={() => onChange(o.value)} style={itemStyle}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function PageHead({ eyebrow, title, sub, children }) {
  return (
    <header className="page-head">
      <div className="title">
        {eyebrow && <p className="muted">{eyebrow}</p>}
        <h1 className="h1">{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children}
    </header>
  );
}

export const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
