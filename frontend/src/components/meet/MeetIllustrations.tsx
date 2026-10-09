/** Line illustrations for Meet's empty and permission states. Decorative only. */

export function FreeTimeIllustration() {
  return (
    <svg className="meet-illustration" viewBox="0 0 320 180" role="presentation" aria-hidden="true">
      <path d="M8 168h300" stroke="currentColor" strokeWidth="1.5" />
      {/* plant pot */}
      <path d="M22 168c-6-38 6-66 22-70 14-3 26 20 26 70z" fill="var(--meet-ill-pink)" stroke="currentColor" strokeWidth="1.5" />
      {/* steam */}
      <path d="M120 96c-14-10 18-16 4-28-12-10 14-18 8-30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* cup */}
      <path d="M98 112h56l-6 46a10 10 0 0 1-10 10h-24a10 10 0 0 1-10-10z" fill="url(#meet-cup)" stroke="currentColor" strokeWidth="1.5" />
      <path d="M154 122c14 0 16 22 0 24" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* pencil */}
      <path d="M178 60l8-6 28 112-8 4z" fill="var(--meet-ill-yellow)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {/* tablet */}
      <path d="M212 70h80l-22 98h-80z" fill="var(--meet-ill-surface)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M288 74l8-2-22 96-6 2" fill="var(--meet-ill-pink)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="230" y="96" width="34" height="26" rx="6" transform="rotate(-8 247 109)" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* sun */}
      <circle cx="262" cy="22" r="10" fill="var(--meet-ill-yellow)" />
      <path d="M196 44c10-18 30-18 40-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="meet-cup" x1="0" x2="1">
          <stop offset="0" stopColor="var(--meet-ill-yellow)" />
          <stop offset="1" stopColor="var(--meet-ill-pink)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function AllowDevicesIllustration() {
  return (
    <svg className="meet-illustration meet-illustration-allow" viewBox="0 0 240 180" role="presentation" aria-hidden="true">
      <circle cx="58" cy="130" r="36" fill="#f28b6c" />
      <rect x="40" y="117" width="26" height="26" rx="5" fill="#fff" />
      <path d="M68 124l12-7v26l-12-7z" fill="#fff" />
      <rect x="98" y="14" width="56" height="56" rx="14" fill="#f28b6c" />
      <rect x="119" y="25" width="14" height="26" rx="7" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M113 45c0 9 6 14 13 14s13-5 13-14M126 59v6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M150 168c-2-40 6-70 24-82 16-10 30 2 30 20 0 30-18 48-18 62" fill="#fff" stroke="#202124" strokeWidth="1.5" />
      <circle cx="176" cy="74" r="12" fill="#fff" stroke="#202124" strokeWidth="1.5" />
      {[78, 96, 114, 132].map((y) => <circle key={y} cx="198" cy={y} r="9" fill="#202124" />)}
      <path d="M160 96c-14 4-26 12-34 22M18 66l14 14M10 82h14M26 54l6 14" fill="none" stroke="#202124" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
