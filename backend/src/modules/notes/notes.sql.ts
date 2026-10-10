export const NOTE_COLUMNS_SQL = `
  id, group_id AS "groupId", project_id AS "projectId", task_id AS "taskId",
  creator_id AS "creatorId", title, content,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;
