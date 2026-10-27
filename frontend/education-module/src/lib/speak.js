import { speak as say } from './speech.js';

/** Qisqa yordamchi: so'zni inglizcha talaffuz qiladi. */
export function speak(text, lang = 'en-US') {
  return say(text, { lang, rate: 0.9 });
}
