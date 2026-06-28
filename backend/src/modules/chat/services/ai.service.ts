import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class ChatAiService {
  private readonly logger = new Logger(ChatAiService.name);
  private gemini: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.gemini = new GoogleGenerativeAI(apiKey);
      this.logger.log('Gemini AI initialized');
    } else {
      this.logger.warn('GEMINI_API_KEY not set — AI assistant will use fallback responses');
    }
  }

  async generateAiReply(message: string, history: { role: 'user' | 'model'; text: string }[], _userId: string): Promise<{ reply: string }> {
    const text = (message ?? '').trim();
    if (!text) {
      return { reply: "Men tayyorman. Savol, vazifa yoki matn yozing — yordam beraman." };
    }

    if (this.gemini) {
      try {
        const model = this.gemini.getGenerativeModel(
          { model: 'gemini-1.5-flash' },
          { apiVersion: 'v1' },
        );

        const systemInstruction = `Sen UPZ — aqlli jamoa boshqaruv platformasining AI yordamchisisisan.
Foydalanuvchilarga vazifalar, loyihalar, jamoa boshqaruvi, xabarlar va ish samaradorligi bo'yicha yordam berasan.
Qisqa, aniq va foydali javob ber. Uzbek tilida gapir (agar foydalanuvchi boshqa tilda yozsa, o'sha tilda javob ber).`;

        const geminiHistory = history
          .filter((h) => h.text?.trim())
          .map((h) => ({ role: h.role, parts: [{ text: h.text }] }));

        const chat = model.startChat({
          systemInstruction: { role: 'user', parts: [{ text: systemInstruction }] },
          history: geminiHistory,
        });

        const result = await chat.sendMessage(text);
        const reply = result.response.text().trim();
        if (reply) return { reply };
      } catch (err) {
        this.logger.warn(`Gemini request failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    const lower = text.toLowerCase();
    if (/salom|hello|hi\b|hey\b/i.test(lower)) {
      return { reply: "Salom! Men UPZ AI yordamchisiman. Vazifa, loyiha yoki jamoa boshqaruvi bo'yicha yordam bera olaman." };
    }
    if (/task|vazifa/i.test(lower)) {
      return { reply: `Vazifa yaratish uchun Projects sahifasiga o'ting va "+" tugmasini bosing. Sarlavha, prioritet va muddat belgilang.` };
    }
    return { reply: `"${text}" — bu bo'yicha yordam berish uchun to'liqroq savol yozing.` };
  }
}
