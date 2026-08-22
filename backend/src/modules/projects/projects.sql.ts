export const PROJECT_COLUMNS_SQL = `
  id, group_id AS "groupId", group_id AS "groupId", repository_id AS "repositoryId",
  name, slug, description, cover_url AS "coverUrl", status, priority, progress,
  start_date AS "startDate", deadline, completed_at AS "completedAt",
  created_by AS "createdById", updated_by AS "updatedById",
  created_at AS "createdAt", updated_at AS "updatedAt",
  deleted_at AS "deletedAt", deleted_by AS "deletedBy"
`;

/** Same columns as PROJECT_COLUMNS_SQL, prefixed with `p.` for use in JOIN queries aliased as `p`. */
export const PROJECT_COLUMNS_SQL_P = `
  p.id, p.group_id AS "groupId", p.group_id AS "groupId", p.repository_id AS "repositoryId",
  p.name, p.slug, p.description, p.cover_url AS "coverUrl", p.status, p.priority, p.progress,
  p.start_date AS "startDate", p.deadline, p.completed_at AS "completedAt",
  p.created_by AS "createdById", p.updated_by AS "updatedById",
  p.created_at AS "createdAt", p.updated_at AS "updatedAt",
  p.deleted_at AS "deletedAt", p.deleted_by AS "deletedBy"
`;

export const PROJECT_COLUMN_COLUMNS_SQL = `
  id, project_id AS "projectId", name, color, position, is_default AS "isDefault",
  maps_to_status AS "mapsToStatus", created_at AS "createdAt", updated_at AS "updatedAt"
`;
