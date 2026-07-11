import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

@Injectable()
export class ChatAiService {
  private readonly logger = new Logger(ChatAiService.name);
  private gemini: GoogleGenerativeAI | null = null;
  private readonly modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    if (apiKey) {
      this.gemini = new GoogleGenerativeAI(apiKey);
      this.logger.log(`Gemini AI initialized (model: ${this.modelName})`);
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
        const systemInstructionText = `Sen UPZ — aqlli jamoa boshqaruv platformasining AI yordamchisisisan.
Foydalanuvchilarga vazifalar, loyihalar, jamoa boshqaruvi, xabarlar va ish samaradorligi bo'yicha yordam berasan.
Qisqa, aniq va foydali javob ber. Uzbek tilida gapir (agar foydalanuvchi boshqa tilda yozsa, o'sha tilda javob ber).`;

        const model = this.gemini.getGenerativeModel({ model: this.modelName });

        const geminiHistory = history
          .filter((h) => h.text?.trim())
          .map((h) => ({ role: h.role, parts: [{ text: h.text }] }));

        // Universal fallback: Inject system prompt as the first chat history message.
        // This guarantees 100% compatibility across all Google API versions and SDKs
        // without worrying about "systemInstruction" vs "system_instruction" bugs.
        geminiHistory.unshift(
          { role: 'user', parts: [{ text: `[System Instruction - follow exactly]: ${systemInstructionText}` }] },
          { role: 'model', parts: [{ text: "Tushundim. Tizim qoidalariga doim to'liq amal qilaman." }] }
        );

        const chat = model.startChat({
          history: geminiHistory,
        });

        const result = await chat.sendMessage(text);
        const reply = result.response.text().trim();
        if (reply) return { reply };
      } catch (err) {
        // Log loudly enough to notice in prod — a silent fallback here is
        // exactly what hid the 1.5-flash shutdown for as long as it did.
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Gemini request failed (model: ${this.modelName}): ${errMsg}`);
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

