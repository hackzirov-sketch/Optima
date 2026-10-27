// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { pickVoice, speak } from './speech.js';

afterEach(() => vi.unstubAllGlobals());
it('uses an exact English accent when the device provides it', () => {
  const us = { name: 'US English', lang: 'en-US' };
  const uk = { name: 'UK English', lang: 'en-GB' };
  vi.stubGlobal('speechSynthesis', { getVoices: () => [us, uk] });
  expect(pickVoice('en-GB').voice).toBe(uk);
  expect(pickVoice('en-US').voice).toBe(us);
});
it('speaks the word and exposes genuine playback failures but not cancellation', () => {
  const synth = { getVoices: () => [], cancel: vi.fn(), speak: vi.fn() };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
  const onError = vi.fn();
  speak('happy', { lang: 'en-GB', onError });
  const utterance = synth.speak.mock.calls[0][0];
  expect(utterance.text).toBe('happy');
  expect(utterance.lang).toBe('en-GB');
  utterance.onerror({ error: 'interrupted' });
  expect(onError).not.toHaveBeenCalled();
  utterance.onerror({ error: 'voice-unavailable' });
  expect(onError).toHaveBeenCalledOnce();
});
