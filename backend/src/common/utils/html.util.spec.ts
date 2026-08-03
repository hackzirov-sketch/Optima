import { escapeHtml, safeUrl } from './html.util';

describe('escapeHtml', () => {
  it('neutralises tags', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  // The realistic attack: a display name chosen at registration that renders
  // as a working link inside a mail genuinely sent by the platform.
  it('neutralises an anchor smuggled through a display name', () => {
    const name = '<a href="https://evil.example">Click here</a>';
    const escaped = escapeHtml(name);

    // The text survives — it just stops being markup. No unescaped angle
    // bracket or quote is left, so nothing can open a tag or an attribute.
    expect(escaped).toBe(
      '&lt;a href=&quot;https://evil.example&quot;&gt;Click here&lt;/a&gt;',
    );
    expect(escaped).not.toMatch(/[<>"']/);
  });

  it('escapes attribute-breaking quotes', () => {
    expect(escapeHtml(`" onmouseover="alert(1)`)).toBe(
      '&quot; onmouseover=&quot;alert(1)',
    );
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Ada Lovelace')).toBe('Ada Lovelace');
  });

  it('renders null and undefined as empty', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('safeUrl', () => {
  it('passes http(s) URLs through', () => {
    expect(safeUrl('https://app.example/reset?token=abc')).toBe(
      'https://app.example/reset?token=abc',
    );
  });

  // Escaping alone wouldn't help here — these execute on click.
  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox',
  ])('drops %p', (url) => {
    expect(safeUrl(url)).toBe('');
  });

  it('drops a scheme-relative URL', () => {
    expect(safeUrl('//evil.example/steal')).toBe('');
  });

  it('escapes quotes so the href attribute cannot be broken out of', () => {
    expect(safeUrl('https://app.example/?a="onload="x')).not.toContain('"');
  });
});
