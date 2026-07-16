export const GROUP_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", name, slug, type, description,
  avatar_url AS "avatarUrl", created_by AS "createdById",
  created_at AS "createdAt", updated_at AS "updatedAt",
  deleted_at AS "deletedAt", deleted_by AS "deletedBy"
`;

export const GROUP_MEMBER_COLUMNS_SQL = `
  id, group_id AS "groupId", user_id AS "userId", role,
  joined_at AS "joinedAt", created_at AS "createdAt", updated_at AS "updatedAt"
`;
