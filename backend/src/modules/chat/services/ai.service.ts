import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

type History = { role: 'user' | 'model'; text: string }[];
type AiReply = {
  reply: string;
  provider: 'gemini' | 'groq';
  grounded: boolean;
  sources: Array<{ title: string; url: string }>;
};
const SYSTEM = `Sen Optima AI yordamchisisan, OPTIMA ilovasidagi sun'iy intellekt yordamchisi. Qisqa, aniq va amaliy javob ber. Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber.
Kimliging, qanday loyiha ekaning yoki nima uchun kerakliging so'ralsa, avval Optima AI yordamchisi ekaningni ayt. OPTIMA chatlar, guruhlar, kanallar, meetinglar, kutubxona, ta'lim, YouTube videolari va shaxsiy faoliyat statistikasi birlashgan muloqot va o'rganish platformasi. Sen savollarga javob berish, tushuntirish, matn yozish va tahrirlash, tarjima, o'qish va ishni rejalashtirish hamda OPTIMA bo'limlari bo'yicha yo'l ko'rsatishga yordam berasan. Shu xizmatlarning hammasini o'zing bevosita bajara olishingni da'vo qilma.
Masalan, "Sen kimsan?" savoliga: "Men Optima AI yordamchisiman. OPTIMA ichida savollaringizga javob berish, o'rganish va kundalik ishlaringizni yengillashtirish uchun yordam beraman." Mazmunni saqla, ammo har safar bir xil shablonni takrorlama.
Texnik model yoki provayder so'ralsa, mahsulot nomi Optima AI ekanini va u tashqi AI modellaridan foydalanishini tushuntir. Aniq model versiyasi yoki yaratuvchisini bilmasang, taxmin qilma; OPTIMA o'z bazaviy modelini yaratgan deb aytma.
Foydalanuvchining akkaunti, fayllari, chatlari yoki meetinglariga kirishing bor deb da'vo qilma. Amalda bajarilmagan amalni bajarildi dema. Ishonching komil bo'lmagan faktni uydirma.`;

/** An image sent with a question (AI vision). */
export interface AiImage {
  mimeType: string;
  data: Buffer;
}

@Injectable()
export class ChatAiService {
  private readonly logger = new Logger(ChatAiService.name);
  private readonly gemini = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;
  private readonly groq = process.env.GROQ_API_KEY
    ? new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      })
    : null;
  /**
   * Tried in order: Google retires models for new keys (gemini-2.5-flash now
   * answers 404) and the "latest" alias is often overloaded (503), so one
   * name is not enough. GEMINI_MODEL, if set, goes first.
   */
  private readonly geminiModels = [
    ...new Set([
      process.env.GEMINI_MODEL?.trim(),
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.5-flash-lite',
    ].filter((model): model is string => Boolean(model))),
  ];
  private readonly groqModel =
    process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';

  private needsFreshFacts(text: string) {
    return /\b(today|latest|current|news|price|weather|score|president|ceo|202[5-9]|bugun|hozir|so'nggi|yangilik|narx|ob-havo|kurs)\b/i.test(
      text,
    );
  }

  private async withTimeout<T>(work: Promise<T>, ms = 18000): Promise<T> {
    // The timer has to be cleared on the happy path. Promise.race settles as
    // soon as `work` resolves, but the losing timeout stays armed and keeps
    // its closure alive until it fires — one leaked timer per AI call, held
    // for 18s each. Harmless once, measurable under load.
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async askGroq(message: string, history: History, system = SYSTEM): Promise<AiReply> {
    if (!this.groq) throw new Error('GROQ_NOT_CONFIGURED');
    const response = await this.withTimeout(
      this.groq.chat.completions.create({
        model: this.groqModel,
        temperature: 0.35,
        max_tokens: 1200,
        user: 'optima-user',
        messages: [
          { role: 'system', content: system },
          ...history.map((item) => ({
            role:
              item.role === 'model'
                ? ('assistant' as const)
                : ('user' as const),
            content: item.text,
          })),
          { role: 'user', content: message },
        ],
      }),
    );
    const reply = response.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('GROQ_EMPTY');
    return { reply, provider: 'groq', grounded: false, sources: [] };
  }

  private async askGemini(
    message: string,
    history: History,
    grounded: boolean,
    images: AiImage[] = [],
    system = SYSTEM,
  ): Promise<AiReply> {
    if (!this.gemini) throw new Error('GEMINI_NOT_CONFIGURED');
    let lastError: unknown;
    for (const name of this.geminiModels) {
      try {
        return await this.askGeminiModel(name, message, history, grounded, images, system);
      } catch (error) {
        lastError = error;
        // Retired, overloaded or rate-limited: the next model may answer.
        if (!/\b(404|429|500|503)\b|AI_TIMEOUT|not found|no longer available|high demand|overloaded/i.test(String((error as Error)?.message))) throw error;
        this.logger.warn(`Gemini ${name} unavailable, trying the next model: ${(error as Error)?.message?.slice(0, 160)}`);
      }
    }
    throw lastError;
  }

  private async askGeminiModel(
    modelName: string,
    message: string,
    history: History,
    grounded: boolean,
    images: AiImage[],
    system = SYSTEM,
  ): Promise<AiReply> {
    const model = this.gemini!.getGenerativeModel({
      model: modelName,
      systemInstruction: system,
      ...(grounded ? { tools: [{ googleSearch: {} }] as any } : {}),
    });
    const chat = model.startChat({
      history: [
        ...history.map((item) => ({
          role: item.role,
          parts: [{ text: item.text }],
        })),
      ],
    });
    const result = await this.withTimeout(
      chat.sendMessage([
        ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') } })),
        { text: message },
      ]),
      images.length ? 40000 : 14000,
    );
    const reply = result.response.text().trim();
    if (!reply) throw new Error('GEMINI_EMPTY');
    const metadata = (result.response.candidates?.[0] as any)
      ?.groundingMetadata;
    const sources = (metadata?.groundingChunks || [])
      .map((chunk: any) => chunk.web)
      .filter(Boolean)
      .map((web: any) => ({ title: web.title || web.uri, url: web.uri }))
      .slice(0, 6);
    return {
      reply,
      provider: 'gemini',
      grounded: Boolean(grounded && sources.length),
      sources,
    };
  }

  /**
   * Folds one exchange into the person's memory: durable facts only (who they
   * are, what they work on or study, preferences, ongoing goals), never the
   * conversation itself. Returns the new memory, or null when nothing changed.
   */
  async updateMemory(existing: string, question: string, answer: string): Promise<string | null> {
    const system = `Sen foydalanuvchi xotirasini yurituvchi yordamchisan. Vazifang: mavjud xotira va oxirgi savol-javobdan foydalanuvchi haqida UZOQ MUDDAT foydali faktlarni ajratish (ismi, kasbi/o'qishi, loyihalari, maqsadlari, afzal ko'rgan til va javob uslubi, muhim kontekst).
Qoidalar: faqat foydalanuvchining o'zi aytgan yoki aniq ko'rinib turgan narsalar; bir martalik savollar, umumiy bilim va AI javobidagi faktlarni yozma; parol, karta, telefon kabi maxfiy ma'lumotlarni hech qachon yozma.
Natija: yangilangan xotira — har biri "- " bilan boshlanuvchi qisqa qatorlar, ko'pi bilan 25 qator, eski faktlarni saqla, eskirganini yangisi bilan almashtir. Yangi narsa bo'lmasa faqat NO_CHANGE deb yoz.`;
    const prompt = `Mavjud xotira:\n${existing.trim() || '(bo\'sh)'}\n\nFoydalanuvchi: ${question.slice(0, 3000)}\n\nAI javobi: ${answer.slice(0, 2000)}`;
    const attempts = [
      this.groq && (() => this.askGroq(prompt, [], system)),
      this.gemini && (() => this.askGemini(prompt, [], false, [], system)),
    ];
    for (const attempt of attempts) {
      if (!attempt) continue;
      try {
        const { reply } = await attempt();
        const text = reply.trim();
        if (!text || /^NO_CHANGE\b/i.test(text)) return null;
        return text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('- '))
          .slice(0, 25)
          .join('\n')
          .slice(0, 3000) || null;
      } catch (error) {
        this.logger.debug(`Memory update failed: ${(error as Error)?.message?.slice(0, 120)}`);
      }
    }
    return null;
  }

  async generateAiReply(
    message: string,
    history: History,
    userId: string,
    images: AiImage[] = [],
    memory = '',
  ): Promise<AiReply> {
    // What Optima AI remembers about this person (see AiMemoryService): read
    // before every answer so they never have to explain themselves again.
    const system = memory.trim()
      ? `${SYSTEM}\n\nFoydalanuvchi haqida avvalgi suhbatlardan eslab qolganlaring (faqat kerak bo'lsa ishlat, ro'yxatni o'qib berma):\n${memory.trim()}`
      : SYSTEM;
    // A picture with no words still deserves an answer.
    const text = message.trim() || (images.length ? 'Bu rasmda nima borligini tushuntirib ber.' : '');
    if (images.length) {
      // Only Gemini sees images (the Groq model is text-only).
      try {
        return await this.askGemini(text, history, false, images, system);
      } catch (error) {
        this.logger.warn(`AI image request failed for user ${userId}: ${error instanceof Error ? error.message : 'unknown'}`);
        throw new ServiceUnavailableException('AI xizmatlari vaqtincha band. Birozdan keyin qayta urinib ko‘ring.');
      }
    }
    if (!text)
      return {
        reply: 'Savolingizni yozing — yordam beraman.',
        provider: this.groq ? 'groq' : 'gemini',
        grounded: false,
        sources: [],
      };
    const fresh = this.needsFreshFacts(text);
    const providers = fresh
      ? [
          this.gemini && (() => this.askGemini(text, history, true, [], system)),
          this.groq && (() => this.askGroq(text, history, system)),
        ]
      : [
          this.groq && (() => this.askGroq(text, history, system)),
          this.gemini && (() => this.askGemini(text, history, false, [], system)),
        ];
    for (const provider of providers) {
      if (!provider) continue;
      try {
        return await provider();
      } catch (error) {
        this.logger.warn(
          `AI provider failed for user ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
    throw new ServiceUnavailableException(
      'AI xizmatlari vaqtincha band. Birozdan keyin qayta urinib ko‘ring.',
    );
  }
}
