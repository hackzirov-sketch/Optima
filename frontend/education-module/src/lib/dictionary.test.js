import { afterEach, expect, it, vi } from 'vitest';
import rows from '../data/cefr.json';
import { buildDictionary, DICTIONARY_LEVELS, filterDictionary, lookupWord, parseDictionaryEntries } from './dictionary.js';

afterEach(() => vi.unstubAllGlobals());
it('imports licensed records at all six real source levels with no fabricated translations', () => {
  const words = buildDictionary(rows);
  expect(words.length).toBeGreaterThan(9000);
  for (const level of DICTIONARY_LEVELS) expect(words.filter(word => word.level === level).length).toBeGreaterThan(900);
  expect(new Set(words.map(word => word.id)).size).toBe(words.length);
  expect(words.find(word => word.lookup === 'mother' && word.pos === 'noun').uz).toBe('ona');
  expect(words.find(word => word.level === 'C2').uz).toBe('');
});
it('searches spelling variants and translated words within filters', () => {
  const words = buildDictionary(rows);
  expect(filterDictionary(words, { query: 'ona', level: 'A1' }).some(word => word.lookup === 'mother')).toBe(true);
  const advanced = filterDictionary(words, { level: 'C2', pos: 'noun' });
  expect(advanced.length).toBeGreaterThan(0);
  expect(advanced.every(word => word.level === 'C2' && word.pos === 'noun')).toBe(true);
  expect(filterDictionary(words, { query: 'colour' }).some(word => word.variants.includes('colour'))).toBe(true);
  expect(filterDictionary(words, { savedOnly: true, savedWords: ['mother'] }).every(word => word.lookup === 'mother')).toBe(true);
});
it('keeps relations in the correct part of speech and definition, with safe credits', () => {
  const data = parseDictionaryEntries([{ phonetic: '/tɛst/', sourceUrls: ['https://example.org/test', 'javascript:alert(1)'], license: { name: 'CC BY-SA', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }, meanings: [
    { partOfSpeech: 'noun', synonyms: ['exam', 'exam'], antonyms: [], definitions: [{ definition: 'An examination.', synonyms: ['assessment'], antonyms: [] }] },
    { partOfSpeech: 'verb', synonyms: ['try'], definitions: [{ definition: 'To try.' }] },
  ] }], 'noun');
  expect(data.meanings).toHaveLength(1);
  expect(data.meanings[0].synonyms).toEqual(['exam']);
  expect(data.meanings[0].definitions[0].synonyms).toEqual(['assessment']);
  expect(data.meanings[0].antonyms).toEqual([]);
  expect(data.sources).toEqual(['https://example.org/test']);
  expect(data.licenses).toHaveLength(1);
});
it('requests public data without credentials and reports missing words', async () => {
  const fetch = vi.fn(async () => ({ status: 404, ok: false }));
  vi.stubGlobal('fetch', fetch);
  await expect(lookupWord('unknown-test-word', 'noun')).rejects.toThrow('izoh topilmadi');
  expect(fetch).toHaveBeenCalledWith('https://api.dictionaryapi.dev/api/v2/entries/en/unknown-test-word?source=optima', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
});
it('does not cache a request aborted while its response is parsing', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, json: async () => { controller.abort(); return [{ meanings: [] }]; } })));
  await expect(lookupWord('abort-test-word', 'noun', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});

it('fills missing relations from the public word-relation source without replacing dictionary relations', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => [{ meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition: 'Feeling pleasure.' }] }] }] })
    .mockResolvedValueOnce({ ok: true, json: async () => [{ word: 'content' }, { word: 'bright' }] })
    .mockResolvedValueOnce({ ok: true, json: async () => [{ word: 'sad' }] }));
  const result = await lookupWord('happy-fill-test', 'adjective');
  expect(result.relations).toMatchObject({ synonyms: ['content', 'bright'], antonyms: ['sad'], supplemented: true });
});
