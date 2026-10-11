/**
 * Finds links in plain message text, Telegram-style: full http(s) URLs,
 * www. hosts, and bare domains with a common TLD (optima.honeymedia.uz/g/1).
 * Returns text/link pieces; `href` is always an absolute http(s) URL, so a
 * message can never smuggle in a javascript: or data: link.
 */
export type TextPiece = { text: string; href?: string };

const TLDS = "uz|com|org|net|ru|io|dev|app|me|info|edu|gov|tr|co|ai|tv|kz|kg|tj|tm|de|uk|us|eu|xyz|site|online|tech|store|link";
const LINK_PATTERN = new RegExp(
  `\\b(?:https?:\\/\\/[^\\s<>"]+|www\\.[^\\s<>"]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?::\\d{2,5})?(?:[/?#][^\\s<>"]*)?)(?![a-z0-9@-])`,
  "gi",
);
// Sentence punctuation that follows a link rather than belonging to it.
const TRAILING = /[.,!?;:'"»)\]]+$/;

export function linkify(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    let raw = match[0];
    const start = match.index ?? 0;
    // Part of an e-mail address (name@host.uz) — leave it as text.
    if (start > 0 && text[start - 1] === "@") continue;
    raw = raw.replace(TRAILING, "");
    // …but a ")" closing a "(" inside the link is part of it: wiki/Foo_(bar).
    if (match[0].startsWith(raw + ")") && raw.split("(").length > raw.split(")").length) raw += ")";
    if (!raw) continue;
    if (start > cursor) pieces.push({ text: text.slice(cursor, start) });
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try { new URL(href); pieces.push({ text: raw, href }); } catch { pieces.push({ text: raw }); }
    cursor = start + raw.length;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });
  return pieces;
}
