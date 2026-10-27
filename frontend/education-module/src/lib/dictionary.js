import { WORDS } from '../data/words.js';

export const DICTIONARY_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const PARTS = { noun: 'Ot', verb: 'Fe’l', adjective: 'Sifat', adverb: 'Ravish', preposition: 'Predlog', pronoun: 'Olmosh', conjunction: 'Bog‘lovchi', determiner: 'Aniqlovchi', interjection: 'Undov', 'be-verb': 'Be fe’li', number: 'Son', modal: 'Modal fe’l', phrase: 'Ibora' };
const localPos = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', pron: 'pronoun', conj: 'conjunction', num: 'number', phr: 'phrase' };
export const foldWord = value => String(value ?? '').toLocaleLowerCase('en').replace(/[‘’ʻʼ']/g, '').trim();

export function buildDictionary(rows) {
  const translations = new Map(WORDS.map(word => [`${foldWord(word.en)}:${localPos[word.pos]}`, word]));
  const seen = new Set();
  return rows.filter(row => DICTIONARY_LEVELS.includes(row.level)).flatMap(row => {
    const variants = row.word.split('/').map(word => word.trim()).filter(Boolean);
    const key = `${foldWord(row.word)}:${row.pos}:${row.level}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const local = variants.map(word => translations.get(`${foldWord(word)}:${row.pos}`)).find(Boolean);
    return [{ id: key, en: row.word, lookup: variants[0], variants, pos: row.pos, level: row.level, source: row.source, uz: local?.uz ?? '', ru: local?.ru ?? '' }];
  }).sort((a, b) => a.en.localeCompare(b.en) || a.pos.localeCompare(b.pos));
}

export function filterDictionary(words, { query = '', level = 'all', pos = 'all', savedOnly = false, savedWords = [] }) {
  const q = foldWord(query);
  return words.filter(word => (level === 'all' || word.level === level) && (pos === 'all' || word.pos === pos) && (!savedOnly || savedWords.includes(word.lookup)))
    .map(word => {
      const names = word.variants.map(foldWord);
      const score = !q || names.includes(q) ? 0 : names.some(name => name.startsWith(q)) ? 1 : [word.en, word.uz, word.ru].some(value => foldWord(value).includes(q)) ? 2 : -1;
      return { word, score };
    }).filter(item => item.score >= 0).sort((a, b) => a.score - b.score).map(item => item.word);
}

const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()))];
const httpsUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } };
const meaningRelations = (meanings, type) => unique(meanings.flatMap(meaning => [
  ...(meaning[type] ?? []),
  ...(meaning.definitions ?? []).flatMap(definition => definition[type] ?? []),
]));

export function parseDictionaryEntries(entries, pos) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('Bu so‘z uchun lug‘at ma’lumoti topilmadi.');
  const meanings = entries.flatMap(entry => Array.isArray(entry.meanings) ? entry.meanings : []);
  const matches = meanings.filter(meaning => meaning.partOfSpeech === pos);
  return {
    phonetic: entries.flatMap(entry => [entry.phonetic, ...(entry.phonetics ?? []).map(item => item.text)]).find(value => typeof value === 'string' && value) ?? '',
    meanings: (matches.length ? matches : meanings).map(meaning => ({
      pos: meaning.partOfSpeech,
      definitions: (meaning.definitions ?? []).filter(item => typeof item.definition === 'string').map(item => ({ text: item.definition, example: typeof item.example === 'string' ? item.example : '', synonyms: unique(item.synonyms ?? []), antonyms: unique(item.antonyms ?? []) })),
      synonyms: unique(meaning.synonyms ?? []), antonyms: unique(meaning.antonyms ?? []),
    })),
    sources: unique(entries.flatMap(entry => entry.sourceUrls ?? [])).map(httpsUrl).filter(Boolean),
    licenses: entries.map(entry => entry.license).filter(item => item && typeof item.name === 'string' && httpsUrl(item.url)).map(item => ({ name: item.name, url: httpsUrl(item.url) })).filter((item, index, all) => all.findIndex(other => other.url === item.url) === index),
  };
}

const cache = new Map();
async function lookupRelations(word, type, signal) {
  try {
    const response = await fetch(`https://api.datamuse.com/words?rel_${type}=${encodeURIComponent(word)}&max=12`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) return [];
    return unique((await response.json()).map(item => item?.word).filter(item => foldWord(item) !== foldWord(word)));
  } catch (error) {
    if (signal?.aborted) throw error;
    return [];
  }
}

export async function lookupWord(word, pos, signal) {
  const key = `${word}:${pos}`;
  if (cache.has(key)) return cache.get(key);
  let response;
  try {
    response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}?source=optima`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Ochiq lug‘atga ulanib bo‘lmadi. Internet aloqasini tekshiring.');
  }
  if (response.status === 404) throw new Error('Ochiq lug‘atda bu so‘z uchun izoh topilmadi.');
  if (!response.ok) throw new Error('Lug‘at xizmati hozir javob bermayapti. Qayta urinib ko‘ring.');
  const data = parseDictionaryEntries(await response.json(), pos);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const synonyms = meaningRelations(data.meanings, 'synonyms');
  const antonyms = meaningRelations(data.meanings, 'antonyms');
  const missing = await Promise.all([
    synonyms.length ? [] : lookupRelations(word, 'syn', signal),
    antonyms.length ? [] : lookupRelations(word, 'ant', signal),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  data.relations = {
    synonyms: unique([...synonyms, ...missing[0]]),
    antonyms: unique([...antonyms, ...missing[1]]),
    supplemented: missing.some(items => items.length > 0),
  };
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(key, data);
  return data;
}
