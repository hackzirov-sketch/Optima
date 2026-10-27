import { askTutor } from './tutor.js';

export async function aiStatus() {
  return { ai: false };
}

/**
 * @param {{role:'user'|'assistant', content:string}[]} messages
 * @param {{tutor?:string, lang?:string, mode?:'chat'|'voice'|'lesson'}} opts
 * @returns {Promise<{reply:string, offline:boolean}>}
 */
export async function askAI(messages, { tutor = 'kamron', mode = 'chat' } = {}) {
  const history = messages.map((m) => ({ me: m.role === 'user', text: m.content }));
  const reply = await askTutor(history, mode === 'voice' && tutor === 'sardor' ? 'math' : 'en');
  return { reply, offline: true };
}
