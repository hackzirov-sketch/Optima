export const WORKSPACE_COLUMNS_SQL = `
  id, owner_id AS "ownerId", name, slug, description, avatar_url AS "avatarUrl",
  visibility, max_members AS "maxMembers", max_projects AS "maxProjects",
  created_at AS "createdAt", updated_at AS "updatedAt",
  deleted_at AS "deletedAt", deleted_by AS "deletedBy"
`;

/** Same columns as WORKSPACE_COLUMNS_SQL, prefixed with `w.` for use in JOIN queries aliased as `w`. */
export const WORKSPACE_COLUMNS_SQL_W = `
  w.id, w.owner_id AS "ownerId", w.name, w.slug, w.description, w.avatar_url AS "avatarUrl",
  w.visibility, w.max_members AS "maxMembers", w.max_projects AS "maxProjects",
  w.created_at AS "createdAt", w.updated_at AS "updatedAt",
  w.deleted_at AS "deletedAt", w.deleted_by AS "deletedBy"
`;

export const WORKSPACE_MEMBER_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", user_id AS "userId", role,
  joined_at AS "joinedAt", created_at AS "createdAt", updated_at AS "updatedAt"
`;

export const TAG_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", name, color, created_by AS "createdById",
  created_at AS "createdAt"
`;

export const WORKSPACE_INVITATION_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", email, role, invited_by AS "invitedById",
  token, expires_at AS "expiresAt", accepted_at AS "acceptedAt",
  declined_at AS "declinedAt", created_at AS "createdAt"
`;
