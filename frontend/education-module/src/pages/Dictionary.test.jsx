// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Dictionary from './Dictionary.jsx';
import { lookupWord } from '../lib/dictionary.js';
import { speak } from '../lib/speech.js';

vi.mock('../store.jsx', () => ({ useApp: () => ({ savedWords: [], saveWord: vi.fn() }) }));
vi.mock('../lib/speech.js', () => ({ speak: vi.fn(), stopSpeaking: vi.fn(), ttsSupported: () => true }));
vi.mock('../lib/dictionary.js', async importOriginal => ({ ...await importOriginal(), lookupWord: vi.fn() }));
const definition = text => ({ phonetic: '/test/', meanings: [{ pos: 'noun', definitions: [{ text, example: 'An example.', synonyms: [], antonyms: [] }], synonyms: ['parent'], antonyms: [] }], relations: { synonyms: ['parent'], antonyms: [] }, sources: [], licenses: [] });
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn(() => ({ matches: false }));
  lookupWord.mockReset().mockResolvedValue(definition('A test definition.'));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function render(route = '/lugatlar?q=mother') {
  await act(async () => { root.render(<MemoryRouter initialEntries={[route]}><Dictionary /></MemoryRouter>); });
  await vi.waitFor(() => expect(host.querySelector('.lex-word-list button')).not.toBeNull());
  await act(async () => {});
}
it('offers A1-C2 and shows known translations with distinct relations', async () => {
  await render();
  expect(host.querySelectorAll('.lex-levels button')).toHaveLength(7);
  expect(host.querySelector('.lex-translation').textContent).toContain('ona');
  expect(host.querySelector('.lex-meanings').textContent).toContain('Sinonimlar');
  expect(host.querySelector('.lex-meanings').textContent).toContain('Antonimlar');
  expect(host.querySelector('.lex-meanings').textContent).toContain('Manbada ko‘rsatilmagan');
});
it('passes the chosen accent and word to TTS', async () => {
  await render();
  await act(async () => [...host.querySelectorAll('.lex-pronunciation button')].find(button => button.textContent === 'Britaniya').click());
  await act(async () => host.querySelector('.lex-audio').click());
  expect(speak).toHaveBeenCalledWith('mother', expect.objectContaining({ lang: 'en-GB', rate: 0.85 }));
});
it('changes to C2 without retaining an unrelated A1 word', async () => {
  await render('/lugatlar');
  await act(async () => [...host.querySelectorAll('.lex-level-options button')].find(button => button.querySelector('.lex-level-symbol').textContent === 'C2').click());
  expect(host.querySelector('.lex-entry-meta .lex-badge').textContent).toBe('C2');
  expect(host.querySelector('.lex-translation').textContent).toContain('hali kiritilmagan');
});
it('moves the detail to the first word on the next result page', async () => {
  await render('/lugatlar');
  const old = host.querySelector('.lex-entry-top h2').textContent;
  await act(async () => host.querySelector('[aria-label="Keyingi sahifa"]').click());
  expect(host.querySelector('.lex-entry-top h2').textContent).not.toBe(old);
  expect(host.querySelector('.lex-entry-top h2').textContent).toBe(host.querySelector('.lex-word-list strong').textContent);
});
it('ignores a stale lookup when the selected word changes', async () => {
  let resolveOld;
  lookupWord.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(definition('New selection.'));
  await render('/lugatlar');
  await act(async () => host.querySelectorAll('.lex-word-list button')[1].click());
  await act(async () => resolveOld(definition('Stale result.')));
  expect(host.querySelector('.lex-meanings').textContent).toContain('New selection.');
  expect(host.querySelector('.lex-meanings').textContent).not.toContain('Stale result.');
});
it('shows a retry state when the public dictionary is offline', async () => {
  lookupWord.mockRejectedValue(new Error('Internet aloqasini tekshiring.'));
  await render();
  expect(host.querySelector('.lex-error').textContent).toContain('Internet aloqasini tekshiring');
  expect(host.querySelector('.lex-error button').textContent).toBe('Qayta urinish');
});
