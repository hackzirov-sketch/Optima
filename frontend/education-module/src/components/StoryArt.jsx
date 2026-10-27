/* Hikoyalar uchun oddiy SVG muqova rasmlari (rasm fayli kerak emas). */
const W = '#FFFFFF';

function Scene({ art }) {
  switch (art) {
    case 'sunrise':
      return (<>
        <circle cx="160" cy="120" r="46" fill="#FFC94D" /><rect y="120" width="320" height="60" fill="#3E2F95" />
        <path d="M0 140q80-20 160 0t160 0v40H0z" fill="#2D2275" />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={40 + i * 56} y="150" width="30" height="4" rx="2" fill="#FFC94D" opacity=".5" />)}
      </>);
    case 'family':
      return (<>
        <rect y="140" width="320" height="40" fill="#8F4A06" />
        {[[90, 54, '#FDE3C2'], [130, 60, '#F6D0A8'], [170, 46, '#FDE3C2'], [205, 40, '#F6D0A8'], [235, 32, '#FDE3C2']].map(([x, h, c], i) => (
          <g key={i}><circle cx={x} cy={140 - h - 12} r="13" fill={c} /><rect x={x - 14} y={140 - h} width="28" height={h} rx="12" fill={['#FFD166', '#FFFFFF', '#FF9F6B', '#FFE08A', '#FFB3C7'][i]} /></g>
        ))}
      </>);
    case 'home':
      return (<>
        <rect y="140" width="320" height="40" fill="#0A6B5F" />
        <rect x="100" y="80" width="120" height="62" fill="#FFF3E0" /><path d="M90 84l70-46 70 46z" fill="#2FBF71" />
        <rect x="150" y="104" width="22" height="38" fill="#8F5A3C" /><rect x="114" y="96" width="24" height="20" fill="#9ED6F7" /><rect x="184" y="96" width="24" height="20" fill="#9ED6F7" />
        <circle cx="60" cy="110" r="24" fill="#2FBF71" /><rect x="57" y="120" width="6" height="22" fill="#6B4226" /><circle cx="52" cy="104" r="4" fill="#FF6B5A" /><circle cx="66" cy="112" r="4" fill="#FF6B5A" />
      </>);
    case 'school':
      return (<>
        <rect y="146" width="320" height="34" fill="#8E2A3F" />
        <rect x="80" y="70" width="160" height="78" fill="#FFF3E0" /><rect x="140" y="40" width="40" height="40" fill="#FFE6A8" /><circle cx="160" cy="58" r="10" fill={W} stroke="#8E2A3F" strokeWidth="2" />
        <path d="M160 52v6l4 3" stroke="#8E2A3F" strokeWidth="2" fill="none" />
        {[96, 124, 182, 210].map((x) => <rect key={x} x={x} y="88" width="18" height="18" fill="#9ED6F7" />)}
        <rect x="150" y="116" width="20" height="32" fill="#C2405A" />
        <path d="M182 40v-22l18 6-18 6" fill="#2FBF71" stroke="#2FBF71" />
      </>);
    case 'food':
      return (<>
        <rect y="130" width="320" height="50" fill="#075C80" />
        <ellipse cx="160" cy="132" rx="84" ry="18" fill={W} /><ellipse cx="160" cy="124" rx="64" ry="22" fill="#F2B544" />
        {[[130, 118], [150, 112], [172, 116], [190, 122], [140, 128], [176, 128]].map(([x, y], i) => <rect key={i} x={x} y={y} width="10" height="4" rx="2" fill="#E8742A" />)}
        <circle cx="62" cy="120" r="16" fill="#E8453C" /><path d="M62 104q4-6 10-6" stroke="#2FBF71" strokeWidth="3" fill="none" />
        <circle cx="262" cy="118" r="18" fill="#7CC96A" /><path d="M248 118h28M262 104v28" stroke="#4F9A40" strokeWidth="2" />
      </>);
    case 'mountain':
      return (<>
        <path d="M0 150l70-90 50 60 50-80 80 110 70-40v70H0z" fill="#3F7314" />
        <path d="M170 40l22 32-12-6-10 10-8-8-10 6z" fill={W} /><path d="M70 60l14 18-8-2-6 6-6-6-8 2z" fill={W} />
        <path d="M0 160q80-18 160 0t160 0v20H0z" fill="#7DBE3C" /><circle cx="270" cy="42" r="18" fill="#FFE08A" />
      </>);
    case 'kite':
    default:
      return (<>
        <rect y="140" width="320" height="40" fill="#F3D9A4" /><path d="M0 140q60-10 120 0t200 0v6H0z" fill="#9ED6F7" />
        <path d="M200 36l26 30-26 30-26-30z" fill="#E8453C" /><path d="M200 36v60M174 66h52" stroke="#B22E26" strokeWidth="2" />
        <path d="M200 96q-10 16 0 30t-4 28" stroke="#FFD166" strokeWidth="3" fill="none" /><path d="M202 96q14 14 6 30t8 26" stroke="#FFD166" strokeWidth="3" fill="none" />
        <path d="M200 96L120 150" stroke="#555" strokeWidth="1" />
        <circle cx="118" cy="138" r="7" fill="#F6D0A8" /><rect x="111" y="145" width="14" height="20" rx="6" fill="#2B4BE0" />
        <circle cx="146" cy="140" r="7" fill="#F6D0A8" /><rect x="139" y="147" width="14" height="18" rx="6" fill="#FF9F6B" />
      </>);
  }
}

export default function StoryArt({ art, color, height = 180, rounded = 0 }) {
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" width="100%" height={height} aria-hidden="true" style={{ display: 'block', background: color, borderRadius: rounded }}>
      <circle cx="40" cy="36" r="22" fill="#fff" opacity=".12" /><circle cx="290" cy="24" r="40" fill="#fff" opacity=".08" />
      <Scene art={art} />
    </svg>
  );
}
