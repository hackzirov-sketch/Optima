export const TASK_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", project_id AS "projectId", group_id AS "groupId",
  column_id AS "columnId", parent_task_id AS "parentTaskId", task_number AS "taskNumber",
  creator_id AS "creatorId", assignee_id AS "assigneeId", reviewer_id AS "reviewerId",
  title, description, type, priority, status, story_points AS "storyPoints",
  estimated_hours AS "estimatedHours", spent_hours AS "spentHours",
  start_date AS "startDate", due_date AS "dueDate", started_at AS "startedAt",
  completed_at AS "completedAt", completion_note AS "completionNote",
  github_pr_number AS "githubPrNumber", github_pr_url AS "githubPrUrl", position,
  created_at AS "createdAt", updated_at AS "updatedAt",
  deleted_at AS "deletedAt", deleted_by AS "deletedBy"
`;

export const TASK_ACTIVITY_COLUMNS_SQL = `
  id, task_id AS "taskId", user_id AS "userId", type, description, metadata,
  created_at AS "createdAt"
`;

export const TASK_DEPENDENCY_COLUMNS_SQL = `
  id, task_id AS "taskId", depends_on_id AS "dependsOnId", type,
  created_by AS "createdById", created_at AS "createdAt"
`;

export const TASK_PUSH_COLUMNS_SQL = `
  id, task_id AS "taskId", user_id AS "userId", repository_id AS "repositoryId",
  branch_name AS "branchName", type, status, commit_message AS "commitMessage",
  commit_sha AS "commitSha", commits_count AS "commitsCount", files_changed AS "filesChanged",
  added_lines AS "addedLines", removed_lines AS "removedLines",
  storage_provider AS "storageProvider", storage_url AS "storageUrl", storage_key AS "storageKey",
  github_commit_sha AS "githubCommitSha", github_pr_url AS "githubPrUrl",
  github_pr_number AS "githubPrNumber", expires_at AS "expiresAt",
  reviewed_by AS "reviewedById", reviewed_at AS "reviewedAt", rejected_reason AS "rejectedReason",
  cli_version AS "cliVersion", created_at AS "createdAt", updated_at AS "updatedAt",
  deleted_at AS "deletedAt"
`;

/** Same columns as TASK_PUSH_COLUMNS_SQL, prefixed with `p.` for use in JOIN queries aliased as `p`. */
export const TASK_PUSH_COLUMNS_SQL_P = `
  p.id, p.task_id AS "taskId", p.user_id AS "userId", p.repository_id AS "repositoryId",
  p.branch_name AS "branchName", p.type, p.status, p.commit_message AS "commitMessage",
  p.commit_sha AS "commitSha", p.commits_count AS "commitsCount", p.files_changed AS "filesChanged",
  p.added_lines AS "addedLines", p.removed_lines AS "removedLines",
  p.storage_provider AS "storageProvider", p.storage_url AS "storageUrl", p.storage_key AS "storageKey",
  p.github_commit_sha AS "githubCommitSha", p.github_pr_url AS "githubPrUrl",
  p.github_pr_number AS "githubPrNumber", p.expires_at AS "expiresAt",
  p.reviewed_by AS "reviewedById", p.reviewed_at AS "reviewedAt", p.rejected_reason AS "rejectedReason",
  p.cli_version AS "cliVersion", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
  p.deleted_at AS "deletedAt"
`;
