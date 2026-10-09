/**
 * Date labels for Meet. Browsers' Intl data for Uzbek is incomplete — months
 * render as "M10" and weekdays fall back to English — so Uzbek uses its own
 * names; every other locale goes through Intl.
 */
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_WEEKDAYS_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const UZ_WEEKDAYS_LONG = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const TAGS: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };

export function weekdayShort(date: Date, locale: string) {
  return locale === "uz" ? UZ_WEEKDAYS_SHORT[date.getDay()] : new Intl.DateTimeFormat(TAGS[locale] || locale, { weekday: "short" }).format(date);
}

/** "Fri, Oct 9" / "Ju, 9-oktabr" */
export function dayTitle(date: Date, locale: string) {
  if (locale === "uz") return `${UZ_WEEKDAYS_SHORT[date.getDay()]}, ${date.getDate()}-${UZ_MONTHS[date.getMonth()]}`;
  return new Intl.DateTimeFormat(TAGS[locale] || locale, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

/** Full label for screen readers: "juma, 9-oktabr" */
export function dayLabel(date: Date, locale: string) {
  if (locale === "uz") return `${UZ_WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()}-${UZ_MONTHS[date.getMonth()]}`;
  return new Intl.DateTimeFormat(TAGS[locale] || locale, { weekday: "long", month: "long", day: "numeric" }).format(date);
}

/** "9-okt" / "Oct 9" — compact date for history rows. */
export function shortDate(date: Date, locale: string) {
  if (locale === "uz") return `${date.getDate()}-${UZ_MONTHS[date.getMonth()].slice(0, 3)}`;
  return new Intl.DateTimeFormat(TAGS[locale] || locale, { month: "short", day: "numeric" }).format(date);
}

/** 24-hour clock everywhere except English. */
export function clock(date: Date, locale: string) {
  return new Intl.DateTimeFormat(TAGS[locale] || locale, { hour: "2-digit", minute: "2-digit", hour12: locale === "en" }).format(date);
}
