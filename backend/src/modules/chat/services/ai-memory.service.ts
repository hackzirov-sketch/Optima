import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { RedisService } from '../../../redis/redis.service';
import { ChatAiService } from './ai.service';

export interface AiMemory {
  content: string;
  enabled: boolean;
  updatedAt: Date | null;
}

const cacheKey = (userId: string) => `ai:memory:${userId}`;
const CACHE_SECONDS = 3600;

/**
 * Optima AI's memory of one person. Read (from Redis, else Postgres) before
 * every answer so they never have to explain who they are again; updated in
 * the background after each saved exchange.
 */
@Injectable()
export class AiMemoryService {
  private readonly logger = new Logger(AiMemoryService.name);
  /** One background update per person at a time — the later exchange waits its turn. */
  private readonly updating = new Map<string, Promise<void>>();

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly ai: ChatAiService,
  ) {}

  async get(userId: string): Promise<AiMemory> {
    const client = this.redis.getClient();
    try {
      const cached = await client?.get(cacheKey(userId));
      if (cached) return JSON.parse(cached) as AiMemory;
    } catch { /* cache is best-effort */ }
    const rows = await this.db.query<AiMemory>(
      `SELECT content, enabled, updated_at AS "updatedAt" FROM ai_memories WHERE user_id = $1`,
      [userId],
    );
    const memory = rows[0] ?? { content: '', enabled: true, updatedAt: null };
    await client?.set(cacheKey(userId), JSON.stringify(memory), 'EX', CACHE_SECONDS).catch(() => undefined);
    return memory;
  }

  /** The text to put in front of the model, or '' when memory is off or empty. */
  async forPrompt(userId: string): Promise<string> {
    const memory = await this.get(userId).catch(() => null);
    return memory?.enabled ? memory.content : '';
  }

  async save(userId: string, patch: { content?: string; enabled?: boolean }) {
    const content = patch.content === undefined ? null : patch.content.slice(0, 3000);
    const rows = await this.db.query<AiMemory>(
      `INSERT INTO ai_memories (user_id, content, enabled) VALUES ($1, COALESCE($2, ''), COALESCE($3, true))
       ON CONFLICT (user_id) DO UPDATE
         SET content = COALESCE($2, ai_memories.content),
             enabled = COALESCE($3, ai_memories.enabled),
             updated_at = now()
       RETURNING content, enabled, updated_at AS "updatedAt"`,
      [userId, content, patch.enabled ?? null],
    );
    await this.redis.getClient()?.del(cacheKey(userId)).catch(() => undefined);
    return rows[0];
  }

  /** Learn from one exchange, off the request path. */
  learn(userId: string, question: string, answer: string) {
    if (!question.trim()) return;
    const previous = this.updating.get(userId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const memory = await this.get(userId);
        if (!memory.enabled) return;
        const updated = await this.ai.updateMemory(memory.content, question, answer);
        if (updated && updated !== memory.content) await this.save(userId, { content: updated });
      })
      .catch((error) => this.logger.debug(`AI memory update skipped: ${(error as Error)?.message}`))
      .finally(() => { if (this.updating.get(userId) === next) this.updating.delete(userId); });
    this.updating.set(userId, next);
  }
}
