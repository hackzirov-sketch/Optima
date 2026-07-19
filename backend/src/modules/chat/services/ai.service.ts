import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

type History = { role: 'user' | 'model'; text: string }[];
type AiReply = { reply: string; provider: 'gemini' | 'groq'; grounded: boolean; sources: Array<{ title: string; url: string }> };
const SYSTEM = `Sen OPTIMA AI yordamchisisan. Qisqa, aniq va amaliy javob ber. Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber. Ishonching komil bo'lmagan faktni uydirma.`;

@Injectable()
export class ChatAiService {
  private readonly logger = new Logger(ChatAiService.name);
  private readonly gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
  private readonly groq = process.env.GROQ_API_KEY ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }) : null;
  private readonly geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  private readonly groqModel = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';

  private needsFreshFacts(text: string) {
    return /\b(today|latest|current|news|price|weather|score|president|ceo|202[5-9]|bugun|hozir|so'nggi|yangilik|narx|ob-havo|kurs)\b/i.test(text);
  }

  private async withTimeout<T>(work: Promise<T>, ms = 18000): Promise<T> {
    return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), ms))]);
  }

  private async askGroq(message: string, history: History): Promise<AiReply> {
    if (!this.groq) throw new Error('GROQ_NOT_CONFIGURED');
    const response = await this.withTimeout(this.groq.chat.completions.create({ model: this.groqModel, temperature: 0.35, max_tokens: 1200, user: 'optima-user', messages: [{ role: 'system', content: SYSTEM }, ...history.map((item) => ({ role: item.role === 'model' ? 'assistant' as const : 'user' as const, content: item.text })), { role: 'user', content: message }] }));
    const reply = response.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('GROQ_EMPTY');
    return { reply, provider: 'groq', grounded: false, sources: [] };
  }

  private async askGemini(message: string, history: History, grounded: boolean): Promise<AiReply> {
    if (!this.gemini) throw new Error('GEMINI_NOT_CONFIGURED');
    const model = this.gemini.getGenerativeModel({ model: this.geminiModel, ...(grounded ? { tools: [{ googleSearch: {} }] as any } : {}) });
    const chat = model.startChat({ history: [{ role: 'user', parts: [{ text: SYSTEM }] }, { role: 'model', parts: [{ text: "Tushundim." }] }, ...history.map((item) => ({ role: item.role, parts: [{ text: item.text }] }))] });
    const result = await this.withTimeout(chat.sendMessage(message));
    const reply = result.response.text().trim();
    if (!reply) throw new Error('GEMINI_EMPTY');
    const metadata = (result.response.candidates?.[0] as any)?.groundingMetadata;
    const sources = (metadata?.groundingChunks || []).map((chunk: any) => chunk.web).filter(Boolean).map((web: any) => ({ title: web.title || web.uri, url: web.uri })).slice(0, 6);
    return { reply, provider: 'gemini', grounded: Boolean(grounded && sources.length), sources };
  }

  async generateAiReply(message: string, history: History, userId: string): Promise<AiReply> {
    const text = message.trim();
    if (!text) return { reply: "Savolingizni yozing — yordam beraman.", provider: this.groq ? 'groq' : 'gemini', grounded: false, sources: [] };
    const fresh = this.needsFreshFacts(text);
    const providers = fresh
      ? [this.gemini && (() => this.askGemini(text, history, true)), this.groq && (() => this.askGroq(text, history))]
      : [this.groq && (() => this.askGroq(text, history)), this.gemini && (() => this.askGemini(text, history, false))];
    for (const provider of providers) {
      if (!provider) continue;
      try { return await provider(); } catch (error) { this.logger.warn(`AI provider failed for user ${userId}: ${error instanceof Error ? error.message : 'unknown'}`); }
    }
    throw new ServiceUnavailableException('AI xizmatlari vaqtincha band. Birozdan keyin qayta urinib ko‘ring.');
  }
}
