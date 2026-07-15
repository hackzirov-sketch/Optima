export const CHAT_ROOM_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", group_id AS "groupId", project_id AS "projectId",
  name, avatar_url AS "avatarUrl", description, is_archived AS "isArchived",
  is_read_only AS "isReadOnly", is_public AS "isPublic", invite_code AS "inviteCode",
  last_message_id AS "lastMessageId", last_message_at AS "lastMessageAt",
  message_seq AS "messageSeq", created_by AS "createdById",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

/** Same columns as CHAT_ROOM_COLUMNS_SQL, prefixed with `r.` for use in JOIN queries aliased as `r`. */
export const CHAT_ROOM_COLUMNS_SQL_R = `
  r.id, r.workspace_id AS "workspaceId", r.group_id AS "groupId", r.project_id AS "projectId",
  r.name, r.avatar_url AS "avatarUrl", r.description, r.is_archived AS "isArchived",
  r.is_read_only AS "isReadOnly", r.is_public AS "isPublic", r.invite_code AS "inviteCode",
  r.last_message_id AS "lastMessageId", r.last_message_at AS "lastMessageAt",
  r.message_seq AS "messageSeq", r.created_by AS "createdById",
  r.created_at AS "createdAt", r.updated_at AS "updatedAt"
`;

export const CHAT_MEMBER_COLUMNS_SQL = `
  id, room_id AS "roomId", user_id AS "userId", is_muted AS "isMuted",
  muted_until AS "mutedUntil", last_read_at AS "lastReadAt",
  last_read_message_id AS "lastReadMessageId", last_read_seq AS "lastReadSeq",
  joined_at AS "joinedAt", left_at AS "leftAt"
`;

export const CHAT_MESSAGE_COLUMNS_SQL = `
  id, room_id AS "roomId", sender_id AS "senderId", reply_to_id AS "replyToId",
  content, content_json AS "contentJson", content_type AS "contentType",
  is_edited AS "isEdited", edited_at AS "editedAt", deleted_at AS "deletedAt",
  is_system AS "isSystem", system_metadata AS "systemMetadata",
  created_at AS "createdAt", updated_at AS "updatedAt", sequence,
  client_message_id AS "clientMessageId", metadata
`;

export const CHAT_REACTION_COLUMNS_SQL = `
  id, message_id AS "messageId", user_id AS "userId", emoji, created_at AS "createdAt"
`;

export const CHAT_ROOM_INVITE_COLUMNS_SQL = `
  id, room_id AS "roomId", created_by AS "createdById", code, max_uses AS "maxUses",
  uses_count AS "usesCount", expires_at AS "expiresAt", revoked_at AS "revokedAt",
  created_at AS "createdAt"
`;

export const MESSAGE_ATTACHMENT_COLUMNS_SQL = `
  id, message_id AS "messageId", uploader_id AS "uploaderId", file_name AS "fileName",
  file_size AS "fileSize", mime_type AS "mimeType", storage_key AS "storageKey",
  storage_url AS "storageUrl", width, height, created_at AS "createdAt"
`;
