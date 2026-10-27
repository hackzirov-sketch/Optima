/*
 * Gapiradigan ustoz avatarlari (SVG): Kamron, Sardor (erkak) va Malika (ayol).
 * state: 'idle' | 'talking' | 'listening' | 'thinking'
 * talking — og'iz harakatlanadi, listening — atrofida to'lqin, thinking — boshi qiyshayadi.
 */
const SKIN = { kamron: '#F2C6A0', sardor: '#E3AE86', malika: '#F4CBAA' };

function Hair({ id }) {
  if (id === 'kamron') {
    return (
      <>
        <path d="M58 78c0-30 20-46 42-46s42 16 42 46c-8-10-20-14-42-14s-34 4-42 14z" fill="#2A1E1A" />
        {/* teskari kepka */}
        <path d="M54 70c2-26 22-42 46-42s44 16 46 42c-14-8-30-11-46-11s-32 3-46 11z" fill="#1F2B5C" />
        <rect x="88" y="27" width="24" height="8" rx="4" fill="#2B4BE0" />
        <path d="M60 66c-10 2-18 6-20 10 8 0 16-2 22-5z" fill="#162046" />
      </>
    );
  }
  if (id === 'sardor') {
    return (
      <path d="M56 84c-4-34 16-54 44-54 30 0 48 20 44 54-4-12-10-20-18-22 2 6 0 10-4 12-2-8-8-14-16-16 0 6-4 10-10 12 0-6-4-10-8-12-6 6-16 10-24 10-4 4-6 10-8 16z" fill="#3A2418" />
    );
  }
  return (
    <>
      {/* Malika: uzun soch va ikki o'rim */}
      <path d="M52 92c-6-40 16-62 48-62s54 22 48 62c-6-18-14-30-26-34-10 8-30 12-44 10-10 6-20 14-26 24z" fill="#2B1810" />
      <path d="M54 88c-6 30-6 60 2 84 8 2 14-2 16-8-8-22-8-50-4-72z" fill="#2B1810" />
      <path d="M146 88c6 30 6 60-2 84-8 2-14-2-16-8 8-22 8-50 4-72z" fill="#2B1810" />
      <circle cx="58" cy="176" r="6" fill="#E04E8F" />
      <circle cx="142" cy="176" r="6" fill="#E04E8F" />
      <path d="M58 60c10-18 26-26 42-26s32 8 42 26" stroke="#E04E8F" strokeWidth="7" fill="none" strokeLinecap="round" />
    </>
  );
}

export default function TutorAvatar({ id = 'kamron', size = 200, state = 'idle', label }) {
  const skin = SKIN[id] || SKIN.kamron;
  const hoodie = id === 'kamron' ? '#2F49B8' : id === 'sardor' ? '#E8A916' : '#E0478C';
  const hoodieDark = id === 'kamron' ? '#22378F' : id === 'sardor' ? '#C98F0B' : '#B93470';
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg viewBox="0 0 200 220" width={size} height={size * 1.1} className={'tutor ' + state} {...a11y}>
      {state === 'listening' && (
        <g className="waves" fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="100" cy="100" r="78" /><circle cx="100" cy="100" r="78" />
        </g>
      )}
      {/* tana (hudi) */}
      <path d="M30 220c4-40 30-62 70-62s66 22 70 62z" fill={hoodie} />
      <path d="M78 160c6 12 14 18 22 18s16-6 22-18" fill="none" stroke={hoodieDark} strokeWidth="5" strokeLinecap="round" />
      <path d="M90 176v24M110 176v24" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <g className="head">
        {id === 'malika' && <path d="M54 88c-6 30-6 60 2 84M146 88c6 30 6 60-2 84" stroke="#2B1810" strokeWidth="1" />}
        <rect x="88" y="132" width="24" height="26" rx="10" fill={skin} />
        <ellipse cx="56" cy="102" rx="9" ry="12" fill={skin} />
        <ellipse cx="144" cy="102" rx="9" ry="12" fill={skin} />
        {id === 'malika' && <><circle cx="55" cy="114" r="3" fill="#F4B32C" /><circle cx="145" cy="114" r="3" fill="#F4B32C" /></>}
        <ellipse cx="100" cy="98" rx="44" ry="48" fill={skin} />
        <Hair id={id} />
        {/* qoshlar */}
        <path className="brow" d="M74 82q9-6 18-1" stroke="#2A1E1A" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path className="brow" d="M108 81q9-5 18 1" stroke="#2A1E1A" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* ko'zlar */}
        <g className="eyes">
          <ellipse cx="83" cy="98" rx="6.5" ry="8" fill="#1A1410" />
          <ellipse cx="117" cy="98" rx="6.5" ry="8" fill="#1A1410" />
          <circle cx="85" cy="95" r="2.2" fill="#fff" />
          <circle cx="119" cy="95" r="2.2" fill="#fff" />
        </g>
        {id === 'sardor' && (
          <g fill="none" stroke="#3B2A20" strokeWidth="3">
            <circle cx="83" cy="98" r="13" /><circle cx="117" cy="98" r="13" /><path d="M96 98h8M70 96l-12-4M130 96l12-4" />
          </g>
        )}
        <ellipse cx="72" cy="114" rx="7" ry="4" fill="#F08A8A" opacity=".35" />
        <ellipse cx="128" cy="114" rx="7" ry="4" fill="#F08A8A" opacity=".35" />
        <path d="M97 108q3 4 6 0" stroke="#B9805E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* og'iz */}
        <path className="mouth-closed" d="M88 122q12 10 24 0" stroke="#7A3A2A" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <g className="mouth-open">
          <ellipse cx="100" cy="124" rx="11" ry="8" fill="#6B2A22" />
          <ellipse cx="100" cy="129" rx="7" ry="3.5" fill="#E46B6B" />
        </g>
      </g>
    </svg>
  );
}
