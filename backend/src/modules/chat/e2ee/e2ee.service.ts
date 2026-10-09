import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatMemberService } from '../services/member.service';
import {
  CreateRoomKeyEpochDto,
  EcPublicJwkDto,
  RegisterDeviceDto,
  ShareRoomKeysDto,
} from '../dto/e2ee.dto';
import {
  E2EE_ATTACHMENT_MIME,
  E2EE_ERRORS,
  E2EE_MAX_DEVICES_PER_USER,
  E2eeEnvelope,
  isE2eeRoom,
  normalizeEnvelope,
} from './e2ee.util';

export interface E2eeRoomRef {
  id: string;
  type: string;
  scope: string;
  e2eeEpoch: number;
}

/** Only the public half of a key ever leaves this service. */
function publicJwk(jwk: EcPublicJwkDto) {
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

/**
 * Key directory and room-key epochs for end-to-end encrypted rooms.
 *
 * The server is a mailbox here: it stores device public keys and room keys
 * wrapped for each device, and decides *when* a new room key is required —
 * never what it is. See 020_chat_e2ee.sql for the model.
 */
@Injectable()
export class ChatE2eeService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly members: ChatMemberService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Devices ─────────────────────────────────────────────

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const key = publicJwk(dto.publicKey);

    const existing = await this.dataSource.query<{
      publicKey: EcPublicJwkDto;
      revokedAt: Date | null;
    }>(
      `SELECT public_key AS "publicKey", revoked_at AS "revokedAt"
         FROM user_device_keys WHERE user_id = $1 AND device_id = $2`,
      [userId, dto.deviceId],
    );
    const row = existing[0];
    // A live device id is bound to its key for good. Accepting a new key for
    // it would let whoever holds the session silently swap the key that
    // other members wrap room keys for.
    if (
      row &&
      !row.revokedAt &&
      (row.publicKey.x !== key.x || row.publicKey.y !== key.y)
    ) {
      throw new ConflictException({
        code: E2EE_ERRORS.DEVICE_KEY_MISMATCH,
        message: 'This device id is already registered with another key',
      });
    }

    await this.dataSource.withTransaction(async (query) => {
      await query(
        `INSERT INTO user_device_keys (user_id, device_id, public_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, device_id) DO UPDATE
           SET public_key = EXCLUDED.public_key,
               revoked_at = NULL,
               last_seen_at = now()`,
        [userId, dto.deviceId, key],
      );
      // Cap active devices: every one of them is a recipient of every future
      // room key, so abandoned browsers would otherwise accumulate forever.
      await query(
        `UPDATE user_device_keys SET revoked_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL AND id IN (
            SELECT id FROM user_device_keys
             WHERE user_id = $1 AND revoked_at IS NULL
             ORDER BY last_seen_at DESC
             OFFSET $2)`,
        [userId, E2EE_MAX_DEVICES_PER_USER],
      );
    });

    return { deviceId: dto.deviceId, publicKey: key };
  }

  // ─── Room state ──────────────────────────────────────────

  private async loadRoom(roomId: string): Promise<E2eeRoomRef> {
    const rows = await this.dataSource.query<E2eeRoomRef>(
      `SELECT id, type, scope, e2ee_epoch AS "e2eeEpoch" FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    return rows[0];
  }

  /**
   * Active member devices vs. the devices the given epoch was wrapped for.
   * Any difference — a member left, joined, or added/retired a device —
   * means the current key is no longer exactly "the members' key".
   */
  private async needsRotation(roomId: string, epoch: number): Promise<boolean> {
    if (epoch <= 0) return true;
    const rows = await this.dataSource.query<{ diff: string }>(
      `WITH member_devices AS (
         SELECT d.user_id, d.device_id
           FROM chat_members m
           JOIN user_device_keys d ON d.user_id = m.user_id AND d.revoked_at IS NULL
          WHERE m.room_id = $1 AND m.left_at IS NULL AND m.status = 'active'
       ), keyed AS (
         SELECT user_id, device_id FROM chat_room_keys
          WHERE room_id = $1 AND epoch = $2
       )
       SELECT (SELECT count(*) FROM (SELECT * FROM member_devices EXCEPT SELECT * FROM keyed) a)
            + (SELECT count(*) FROM (SELECT * FROM keyed EXCEPT SELECT * FROM member_devices) b)
              AS diff`,
      [roomId, epoch],
    );
    return Number(rows[0]?.diff ?? 0) > 0;
  }

  /**
   * Everything a client needs to read and write in a room: whether the room
   * is E2EE at all, the room keys wrapped for *this* device, the member
   * devices a new key would have to be wrapped for, and whether one is due.
   */
  async getRoomState(roomId: string, userId: string, deviceId?: string) {
    await this.members.assertRoomMember(roomId, userId);
    const room = await this.loadRoom(roomId);

    const enabled = isE2eeRoom(room);
    const [devices, keys, needsRotation] = await Promise.all([
      !enabled
        ? Promise.resolve([])
        : this.dataSource.query<{
            userId: string;
            deviceId: string;
            publicKey: EcPublicJwkDto;
          }>(
            `SELECT d.user_id AS "userId", d.device_id AS "deviceId", d.public_key AS "publicKey"
           FROM chat_members m
           JOIN user_device_keys d ON d.user_id = m.user_id AND d.revoked_at IS NULL
          WHERE m.room_id = $1 AND m.left_at IS NULL AND m.status = 'active'
          ORDER BY d.user_id, d.device_id`,
            [roomId],
          ),
      deviceId
        ? this.dataSource.query<{
            epoch: number;
            wrappedKey: string;
            iv: string;
            creatorUserId: string | null;
            creatorDeviceId: string;
            creatorPublicKey: EcPublicJwkDto | null;
          }>(
            // "creator" is whoever wrapped this copy: the epoch's creator, or
            // the device that re-shared it (shareKeys). Its key is looked up
            // even if that device has since been retired — older epochs must
            // stay openable.
            `SELECT k.epoch, k.wrapped_key AS "wrappedKey", k.iv,
                    COALESCE(k.wrapped_by_user, e.created_by) AS "creatorUserId",
                    COALESCE(k.wrapped_by_device, e.created_by_device) AS "creatorDeviceId",
                    d.public_key AS "creatorPublicKey"
               FROM chat_room_keys k
               JOIN chat_room_key_epochs e ON e.room_id = k.room_id AND e.epoch = k.epoch
               LEFT JOIN user_device_keys d
                 ON d.user_id = COALESCE(k.wrapped_by_user, e.created_by)
                AND d.device_id = COALESCE(k.wrapped_by_device, e.created_by_device)
              WHERE k.room_id = $1 AND k.user_id = $2 AND k.device_id = $3
              ORDER BY k.epoch`,
            [roomId, userId, deviceId],
          )
        : Promise.resolve([]),
      enabled ? this.needsRotation(roomId, room.e2eeEpoch) : false,
    ]);
    const missing = await this.missingHistory(roomId);

    // A room that went public keeps the keys of its private past, so members
    // can still open the E2EE history; it just takes no new ciphertext.
    return {
      roomId,
      enabled,
      epoch: room.e2eeEpoch,
      needsRotation,
      devices,
      keys,
      missing,
    };
  }

  /**
   * Older room keys a current member's *new* device lacks although that
   * member already had them on another device. Any device holding the key may
   * re-wrap it (shareKeys) so a member's history follows them; members who
   * joined later never appear here.
   */
  private async missingHistory(roomId: string) {
    return this.dataSource.query<{
      epoch: number;
      userId: string;
      deviceId: string;
      publicKey: EcPublicJwkDto;
    }>(
      `SELECT DISTINCT had.epoch, d.user_id AS "userId", d.device_id AS "deviceId",
              d.public_key AS "publicKey"
         FROM chat_room_keys had
         JOIN chat_members m
           ON m.room_id = had.room_id AND m.user_id = had.user_id
          AND m.left_at IS NULL AND m.status = 'active'
         JOIN user_device_keys d
           ON d.user_id = had.user_id AND d.revoked_at IS NULL
        WHERE had.room_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM chat_room_keys k
             WHERE k.room_id = had.room_id AND k.epoch = had.epoch
               AND k.user_id = d.user_id AND k.device_id = d.device_id)
        ORDER BY had.epoch DESC
        LIMIT 200`,
      [roomId],
    );
  }

  /**
   * Stores room keys a member device re-wrapped for another device. Each one
   * must be an epoch the caller's device holds, for an active member device
   * whose user already held that epoch — history moves between a member's
   * own devices, never to someone who wasn't there.
   */
  async shareKeys(roomId: string, userId: string, dto: ShareRoomKeysDto) {
    await this.members.assertRoomMember(roomId, userId);
    if (dto.keys.length === 0) return { shared: 0 };

    const rows = await this.dataSource.query<{ shared: string }>(
      `WITH incoming AS (
         SELECT * FROM unnest($3::int[], $4::uuid[], $5::text[], $6::text[], $7::text[])
           AS x(epoch, user_id, device_id, wrapped_key, iv)
       ), allowed AS (
         SELECT i.* FROM incoming i
          WHERE EXISTS (  -- the sharing device holds this epoch
                  SELECT 1 FROM chat_room_keys mine
                   WHERE mine.room_id = $1 AND mine.epoch = i.epoch
                     AND mine.user_id = $2 AND mine.device_id = $8)
            AND EXISTS (  -- the recipient user already had it
                  SELECT 1 FROM chat_room_keys had
                   WHERE had.room_id = $1 AND had.epoch = i.epoch
                     AND had.user_id = i.user_id)
            AND EXISTS (  -- ... and is still an active member, on a live device
                  SELECT 1 FROM chat_members m
                    JOIN user_device_keys d
                      ON d.user_id = m.user_id AND d.revoked_at IS NULL
                   WHERE m.room_id = $1 AND m.user_id = i.user_id
                     AND m.left_at IS NULL AND m.status = 'active'
                     AND d.device_id = i.device_id)
       ), inserted AS (
         INSERT INTO chat_room_keys
           (room_id, epoch, user_id, device_id, wrapped_key, iv, wrapped_by_user, wrapped_by_device)
         SELECT $1, epoch, user_id, device_id, wrapped_key, iv, $2, $8 FROM allowed
         ON CONFLICT DO NOTHING
         RETURNING 1
       )
       SELECT count(*) AS shared FROM inserted`,
      [
        roomId,
        userId,
        dto.keys.map((k) => k.epoch),
        dto.keys.map((k) => k.userId),
        dto.keys.map((k) => k.deviceId),
        dto.keys.map((k) => k.wrappedKey),
        dto.keys.map((k) => k.iv),
        dto.deviceId,
      ],
    );
    return { shared: Number(rows[0]?.shared ?? 0) };
  }

  // ─── Rotation ────────────────────────────────────────────

  /**
   * Publishes a new room key. The client generated it and wrapped it for
   * every active member device; the server checks the recipient set is
   * exactly that (no removed member, nobody left out) and that nobody else
   * rotated first.
   */
  async createEpoch(
    roomId: string,
    userId: string,
    dto: CreateRoomKeyEpochDto,
  ) {
    await this.members.assertRoomMember(roomId, userId);

    await this.dataSource.withTransaction(async (query) => {
      const rooms = await query<E2eeRoomRef>(
        `SELECT id, type, scope, e2ee_epoch AS "e2eeEpoch"
           FROM chat_rooms WHERE id = $1 FOR UPDATE`,
        [roomId],
      );
      const room = rooms[0];
      if (!room)
        throw new NotFoundException({
          code: ErrorCode.ROOM_NOT_FOUND,
          message: 'Room not found',
        });
      if (!isE2eeRoom(room))
        throw new BadRequestException({
          code: E2EE_ERRORS.NOT_ALLOWED,
          message: 'Public rooms are not end-to-end encrypted',
        });
      if (dto.epoch !== room.e2eeEpoch + 1)
        throw new ConflictException({
          code: E2EE_ERRORS.STALE_EPOCH,
          message:
            'The room key was rotated by someone else — refresh and retry',
          epoch: room.e2eeEpoch,
        });

      const own = await query(
        `SELECT 1 FROM user_device_keys
          WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
        [userId, dto.deviceId],
      );
      if (!own[0])
        throw new ForbiddenException({
          code: E2EE_ERRORS.UNKNOWN_DEVICE,
          message: 'Register this device before rotating room keys',
        });

      const expected = await query<{ userId: string; deviceId: string }>(
        `SELECT d.user_id AS "userId", d.device_id AS "deviceId"
           FROM chat_members m
           JOIN user_device_keys d ON d.user_id = m.user_id AND d.revoked_at IS NULL
          WHERE m.room_id = $1 AND m.left_at IS NULL AND m.status = 'active'`,
        [roomId],
      );
      const want = new Set(expected.map((r) => `${r.userId}:${r.deviceId}`));
      const got = new Set(dto.keys.map((k) => `${k.userId}:${k.deviceId}`));
      const same =
        want.size === got.size &&
        got.size === dto.keys.length &&
        [...want].every((id) => got.has(id));
      if (!same)
        throw new ConflictException({
          code: E2EE_ERRORS.DEVICE_SET_CHANGED,
          message: 'Room members or their devices changed — refresh and retry',
        });

      await query(
        `INSERT INTO chat_room_key_epochs (room_id, epoch, created_by, created_by_device)
         VALUES ($1, $2, $3, $4)`,
        [roomId, dto.epoch, userId, dto.deviceId],
      );
      await query(
        `INSERT INTO chat_room_keys (room_id, epoch, user_id, device_id, wrapped_key, iv)
         SELECT $1, $2, k.user_id, k.device_id, k.wrapped_key, k.iv
           FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[])
             AS k(user_id, device_id, wrapped_key, iv)`,
        [
          roomId,
          dto.epoch,
          dto.keys.map((k) => k.userId),
          dto.keys.map((k) => k.deviceId),
          dto.keys.map((k) => k.wrappedKey),
          dto.keys.map((k) => k.iv),
        ],
      );
      await query(`UPDATE chat_rooms SET e2ee_epoch = $2 WHERE id = $1`, [
        roomId,
        dto.epoch,
      ]);
    });

    this.events.emit('chat.e2ee_rotated', { roomId, epoch: dto.epoch });
    return { roomId, epoch: dto.epoch };
  }

  // ─── Send-path checks ────────────────────────────────────

  /**
   * Called by the message pipeline for every send/edit. Enforces the split:
   * E2EE rooms accept only ciphertext under the current, up-to-date key;
   * public rooms accept only plaintext (which the server encrypts at rest).
   */
  async assertMessageEncryption(
    room: E2eeRoomRef,
    userId: string,
    rawEnvelope: unknown,
    hasPlaintext: boolean,
    attachmentMimeTypes: string[] = [],
  ): Promise<E2eeEnvelope | null> {
    const encryptedFiles = attachmentMimeTypes.filter(
      (mime) => mime === E2EE_ATTACHMENT_MIME,
    ).length;
    if (!isE2eeRoom(room)) {
      // Nobody in a public room could open them.
      if (encryptedFiles > 0)
        throw new BadRequestException({
          code: E2EE_ERRORS.NOT_ALLOWED,
          message: 'Encrypted files are only for end-to-end encrypted chats',
        });
      if (rawEnvelope)
        throw new BadRequestException({
          code: E2EE_ERRORS.NOT_ALLOWED,
          message:
            'Public rooms take plaintext; the server encrypts it at rest',
        });
      return null;
    }

    const envelope = rawEnvelope ? normalizeEnvelope(rawEnvelope) : null;
    if (rawEnvelope && !envelope)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Malformed encrypted payload',
      });

    if (hasPlaintext)
      throw new BadRequestException({
        code: E2EE_ERRORS.REQUIRED,
        message: 'This conversation is end-to-end encrypted — send ciphertext',
      });
    // Files in an E2EE room must be encrypted on the device, and their keys
    // ride in a v2 envelope — a plain upload here would be readable by the
    // server and anyone holding its URL.
    if (encryptedFiles !== attachmentMimeTypes.length)
      throw new BadRequestException({
        code: E2EE_ERRORS.REQUIRED,
        message: 'Files in this conversation must be encrypted on your device',
      });
    if (attachmentMimeTypes.length > 0 && envelope?.v !== 2)
      throw new BadRequestException({
        code: E2EE_ERRORS.REQUIRED,
        message: 'Encrypted files need their keys in the message envelope',
      });
    if (!envelope) return null;

    if (envelope.epoch !== room.e2eeEpoch)
      throw new ConflictException({
        code: E2EE_ERRORS.STALE_EPOCH,
        message: 'The room key changed — refresh and retry',
        epoch: room.e2eeEpoch,
      });

    const device = await this.dataSource.query(
      `SELECT 1 FROM user_device_keys
        WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [userId, envelope.device],
    );
    if (!device[0])
      throw new ForbiddenException({
        code: E2EE_ERRORS.UNKNOWN_DEVICE,
        message: 'Unknown sending device',
      });

    if (await this.needsRotation(room.id, room.e2eeEpoch))
      throw new ConflictException({
        code: E2EE_ERRORS.REKEY_REQUIRED,
        message: 'Room members changed — a new room key is required',
      });

    return envelope;
  }
}
