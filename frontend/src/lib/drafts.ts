import { api, type ChatDraftRecord } from "./api";
import { decryptEnvelope, prepareOutgoing } from "./e2ee";

/** This tab — its own draft updates come back over the socket and are ignored. */
export const DRAFT_CLIENT_ID = crypto.randomUUID();

/**
 * Saves what's in the composer as this chat's draft (empty text clears it).
 * End-to-end encrypted chats get the same treatment as messages: encrypted
 * here with the room key, so the server keeps only ciphertext.
 */
export async function saveDraft(roomId: string, text: string) {
  if (!text.trim()) return api.chat.saveDraft(roomId, { content: "", clientId: DRAFT_CLIENT_ID });
  const body = await prepareOutgoing(roomId, text);
  return api.chat.saveDraft(roomId, body.e2ee
    ? { e2ee: body.e2ee, clientId: DRAFT_CLIENT_ID }
    : { content: body.content ?? text, clientId: DRAFT_CLIENT_ID });
}

/** A stored draft as text; null when this device can't open it. */
export async function openDraft(record: ChatDraftRecord, userId: string): Promise<string | null> {
  if (record.e2ee) return decryptEnvelope(record.roomId, userId, record.e2ee).catch(() => null);
  return record.content ?? "";
}
