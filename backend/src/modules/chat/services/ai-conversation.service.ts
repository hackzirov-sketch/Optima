import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface AiConversationMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  hasImage: boolean;
  sources: Array<{ title: string; url: string }>;
  createdAt: Date;
}

/** Optima AI's saved conversations — one person's, never shared. */
@Injectable()
export class AiConversationService {
  constructor(private readonly db: DatabaseService) {}

  list(userId: string) {
    return this.db.query<{ id: string; title: string; updatedAt: Date }>(
      `SELECT id, title, updated_at AS "updatedAt" FROM ai_conversations
        WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200`,
      [userId],
    );
  }

  private async assertOwner(id: string, userId: string) {
    const rows = await this.db.query<{ id: string; title: string }>(
      `SELECT id, title FROM ai_conversations WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!rows[0])
      throw new NotFoundException({ code: 'AI_CONVERSATION_NOT_FOUND', message: 'Conversation not found' });
    return rows[0];
  }

  async messages(id: string, userId: string) {
    const conversation = await this.assertOwner(id, userId);
    const messages = await this.db.query<AiConversationMessage>(
      `SELECT id, role, text, has_image AS "hasImage", sources, created_at AS "createdAt"
         FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at, id`,
      [id],
    );
    return { id: conversation.id, title: conversation.title, messages };
  }

  /** The last turns, as the model's history. */
  async history(id: string, userId: string) {
    await this.assertOwner(id, userId);
    const rows = await this.db.query<{ role: 'user' | 'model'; text: string }>(
      `SELECT role, text FROM (
         SELECT role, text, created_at, id FROM ai_messages WHERE conversation_id = $1
          ORDER BY created_at DESC, id DESC LIMIT 20
       ) recent ORDER BY created_at, id`,
      [id],
    );
    return rows.map((row) => ({ role: row.role, text: row.text.slice(0, 4000) }));
  }

  /** Stores one question and its answer; starts the conversation if there is none yet. */
  async record(
    userId: string,
    conversationId: string | undefined,
    question: { text: string; hasImage: boolean },
    answer: { text: string; sources: Array<{ title: string; url: string }> },
  ) {
    let id = conversationId;
    let title: string;
    if (id) {
      title = (await this.assertOwner(id, userId)).title;
    } else {
      title = this.titleFor(question.text, question.hasImage);
      const rows = await this.db.query<{ id: string }>(
        `INSERT INTO ai_conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
        [userId, title],
      );
      id = rows[0].id;
    }
    await this.db.query(
      `INSERT INTO ai_messages (conversation_id, role, text, has_image, created_at)
         VALUES ($1, 'user', $2, $3, now())`,
      [id, question.text, question.hasImage],
    );
    await this.db.query(
      `INSERT INTO ai_messages (conversation_id, role, text, sources, created_at)
         VALUES ($1, 'model', $2, $3::jsonb, now() + interval '1 millisecond')`,
      [id, answer.text, JSON.stringify(answer.sources ?? [])],
    );
    await this.db.query(`UPDATE ai_conversations SET updated_at = now() WHERE id = $1`, [id]);
    return { conversationId: id, title };
  }

  async rename(id: string, userId: string, title: string) {
    await this.assertOwner(id, userId);
    const clean = title.trim().slice(0, 120);
    await this.db.query(`UPDATE ai_conversations SET title = $2 WHERE id = $1`, [id, clean]);
    return { id, title: clean };
  }

  async remove(id: string, userId: string) {
    await this.assertOwner(id, userId);
    await this.db.query(`DELETE FROM ai_conversations WHERE id = $1`, [id]);
  }

  /** The first line of the first question, trimmed to a sidebar-sized title. */
  private titleFor(text: string, hasImage: boolean) {
    const line = text.replace(/\s+/g, ' ').trim();
    if (!line) return hasImage ? 'Rasm haqida savol' : 'Yangi suhbat';
    return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
  }
}
