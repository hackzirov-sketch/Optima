import type { ReactElement } from "react";
import type { Locale } from "../lib/i18n/i18n";

function UzFlag() {
  return (
    <svg viewBox="0 0 30 20" width="20" height="14" aria-hidden="true">
      <rect width="30" height="20" fill="#fff" />
      <rect width="30" height="6" fill="#1EB53A" />
      <rect y="14" width="30" height="6" fill="#0099B5" />
      <rect y="6" width="30" height="0.9" fill="#CE1126" />
      <rect y="13.1" width="30" height="0.9" fill="#CE1126" />
      <circle cx="5.4" cy="3" r="2.05" fill="#fff" />
      <circle cx="6.15" cy="3" r="1.7" fill="#0099B5" />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2].map((col) => (
          <circle key={`${row}-${col}`} cx={9.4 + col * 1.55} cy={1.35 + row * 1.15} r="0.28" fill="#fff" />
        )),
      )}
    </svg>
  );
}

function RuFlag() {
  return (
    <svg viewBox="0 0 30 20" width="20" height="14" aria-hidden="true">
      <rect width="30" height="20" fill="#fff" />
      <rect y="6.67" width="30" height="6.67" fill="#0039A6" />
      <rect y="13.33" width="30" height="6.67" fill="#D52B1E" />
    </svg>
  );
}

function EnFlag() {
  return (
    <svg viewBox="0 0 30 20" width="20" height="14" aria-hidden="true">
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="1.6" />
      <path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth="6.6" />
      <path d="M15 0V20M0 10H30" stroke="#C8102E" strokeWidth="4" />
    </svg>
  );
}

function TrFlag() {
  return (
    <svg viewBox="0 0 30 20" width="20" height="14" aria-hidden="true">
      <rect width="30" height="20" fill="#E30A17" />
      <circle cx="12.5" cy="10" r="5" fill="#fff" />
      <circle cx="13.9" cy="10" r="4" fill="#E30A17" />
      <path fill="#fff" d="m17.8 10-3.53 1.15 2.18-3v3.7l-2.18-3z" />
    </svg>
  );
}

const flags: Record<Locale, () => ReactElement> = {
  uz: UzFlag,
  ru: RuFlag,
  en: EnFlag,
  tr: TrFlag,
};

export function FlagIcon({ locale }: { locale: Locale }) {
  const Flag = flags[locale];
  return (
    <span className="flag-icon">
      <Flag />
    </span>
  );
}