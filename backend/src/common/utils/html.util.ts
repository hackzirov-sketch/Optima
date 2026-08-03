const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes a value for interpolation into an HTML document — currently the
 * outbound email templates.
 *
 * Those templates build HTML by string interpolation, and much of what goes
 * into them is user-controlled: a display name chosen at registration, a task
 * title, a chat message quoted in a notification. Unescaped, a name like
 * `<a href="https://evil.example">Click</a>` renders as working markup inside
 * a mail that genuinely came from us — attacker-authored content carried by a
 * trusted sender, which is the strongest possible position for phishing.
 *
 * `&` is replaced first so already-escaped entities aren't double-encoded
 * incorrectly, and `'`/`"` are covered so the helper is also safe inside an
 * HTML attribute value.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Escapes a URL destined for an `href`.
 *
 * Escaping alone doesn't stop `javascript:`/`data:` URIs, which execute on
 * click — so anything that isn't plainly http(s) is dropped rather than
 * rendered.
 */
export function safeUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  return escapeHtml(raw);
}
