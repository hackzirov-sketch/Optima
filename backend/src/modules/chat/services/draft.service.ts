import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

export interface DraftBody {
  content?: string | null;
  e2ee?: Record<string, unknown> | null;
  /** The tab that wrote it — echoed back so that tab ignores its own update. */
  clientId?: string;
}

const MAX_CONTENT = 4000;
const MAX_ENVELOPE = 24_000;

/**
 * Unsent text per person per chat. Written when they stop typing; every one of
 * their devices is told over the socket. An empty draft deletes the row.
 */
@Injectable()
export class DraftService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventEmitter2,
  ) {}

  async list(userId: string) {
    return this.db.query(
      `SELECT d.room_id AS "roomId", NULLIF(d.content, '') AS content, d.e2ee, d.updated_at AS "updatedAt"
         FROM message_drafts d
         JOIN chat_members m ON m.room_id = d.room_id AND m.user_id = d.user_id AND m.left_at IS NULL
        WHERE d.user_id = $1`,
      [userId],
    );
  }

  async save(userId: string, roomId: string, body: DraftBody) {
    const [member] = await this.db.query(
      `SELECT 1 FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId],
    );
    if (!member)
      throw new ForbiddenException({ code: ErrorCode.NOT_ROOM_MEMBER, message: 'Not a member of this chat' });

    const content = typeof body?.content === 'string' ? body.content : null;
    const e2ee = body?.e2ee && typeof body.e2ee === 'object' ? body.e2ee : null;
    if (content && content.length > MAX_CONTENT)
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Draft is too long' });
    if (e2ee && JSON.stringify(e2ee).length > MAX_ENVELOPE)
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Draft is too long' });

    const empty = !e2ee && !content?.trim();
    let updatedAt: Date | null = null;
    if (empty) {
      await this.db.query(`DELETE FROM message_drafts WHERE user_id = $1 AND room_id = $2`, [userId, roomId]);
    } else {
      const [row] = await this.db.query<{ updatedAt: Date }>(
        `INSERT INTO message_drafts (user_id, room_id, content, e2ee, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id, room_id) DO UPDATE
           SET content = EXCLUDED.content, e2ee = EXCLUDED.e2ee, updated_at = now()
         RETURNING updated_at AS "updatedAt"`,
        [userId, roomId, e2ee ? '' : content, e2ee],
      );
      updatedAt = row.updatedAt;
    }
    const draft = {
      roomId,
      content: empty || e2ee ? null : content,
      e2ee: empty ? null : e2ee,
      updatedAt,
      clientId: typeof body?.clientId === 'string' ? body.clientId.slice(0, 64) : null,
    };
    this.events.emit('chat.draft_updated', { userId, ...draft });
    return draft;
  }
}
