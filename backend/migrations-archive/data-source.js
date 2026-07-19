"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const dotenv = __importStar(require("dotenv"));
const user_entity_1 = require("./entities/user.entity");
const refresh_token_entity_1 = require("./entities/refresh-token.entity");
const user_settings_entity_1 = require("./entities/user-settings.entity");
const github_account_entity_1 = require("./entities/github-account.entity");
const workspace_entity_1 = require("./entities/workspace.entity");
const workspace_member_entity_1 = require("./entities/workspace-member.entity");
const workspace_invitation_entity_1 = require("./entities/workspace-invitation.entity");
const workspace_github_installation_entity_1 = require("./entities/workspace-github-installation.entity");
const group_entity_1 = require("./entities/group.entity");
const group_member_entity_1 = require("./entities/group-member.entity");
const repository_entity_1 = require("./entities/repository.entity");
const project_entity_1 = require("./entities/project.entity");
const project_column_entity_1 = require("./entities/project-column.entity");
const tag_entity_1 = require("./entities/tag.entity");
const task_entity_1 = require("./entities/task.entity");
const task_watcher_entity_1 = require("./entities/task-watcher.entity");
const task_tag_entity_1 = require("./entities/task-tag.entity");
const task_dependency_entity_1 = require("./entities/task-dependency.entity");
const task_activity_entity_1 = require("./entities/task-activity.entity");
const task_sequence_entity_1 = require("./entities/task-sequence.entity");
const task_push_entity_1 = require("./entities/task-push.entity");
const push_review_comment_entity_1 = require("./entities/push-review-comment.entity");
const developer_project_stats_entity_1 = require("./entities/developer-project-stats.entity");
const developer_daily_stats_entity_1 = require("./entities/developer-daily-stats.entity");
const chat_room_entity_1 = require("./entities/chat-room.entity");
const chat_member_entity_1 = require("./entities/chat-member.entity");
const chat_message_entity_1 = require("./entities/chat-message.entity");
const chat_reaction_entity_1 = require("./entities/chat-reaction.entity");
const chat_room_invite_entity_1 = require("./entities/chat-room-invite.entity");
const message_attachment_entity_1 = require("./entities/message-attachment.entity");
const notification_entity_1 = require("./entities/notification.entity");
const audit_log_entity_1 = require("./entities/audit-log.entity");
const user_ip_log_entity_1 = require("./entities/user-ip-log.entity");
const user_verification_entity_1 = require("./entities/user-verification.entity");
const earning_entity_1 = require("./entities/earning.entity");
const note_entity_1 = require("./entities/note.entity");
dotenv.config();
exports.default = new typeorm_1.DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [
        user_entity_1.User,
        refresh_token_entity_1.RefreshToken,
        user_settings_entity_1.UserSettings,
        github_account_entity_1.GithubAccount,
        workspace_entity_1.Workspace,
        workspace_member_entity_1.WorkspaceMember,
        workspace_invitation_entity_1.WorkspaceInvitation,
        workspace_github_installation_entity_1.WorkspaceGithubInstallation,
        group_entity_1.Group,
        group_member_entity_1.GroupMember,
        repository_entity_1.Repository,
        project_entity_1.Project,
        project_column_entity_1.ProjectColumn,
        tag_entity_1.Tag,
        task_entity_1.Task,
        task_watcher_entity_1.TaskWatcher,
        task_tag_entity_1.TaskTag,
        task_dependency_entity_1.TaskDependency,
        task_activity_entity_1.TaskActivity,
        task_sequence_entity_1.TaskSequence,
        task_push_entity_1.TaskPush,
        push_review_comment_entity_1.PushReviewComment,
        developer_project_stats_entity_1.DeveloperProjectStats,
        developer_daily_stats_entity_1.DeveloperDailyStats,
        chat_room_entity_1.ChatRoom,
        chat_member_entity_1.ChatMember,
        chat_message_entity_1.ChatMessage,
        chat_reaction_entity_1.ChatReaction,
        chat_room_invite_entity_1.ChatRoomInvite,
        message_attachment_entity_1.MessageAttachment,
        notification_entity_1.Notification,
        audit_log_entity_1.AuditLog,
        user_ip_log_entity_1.UserIpLog,
        user_verification_entity_1.UserVerification,
        earning_entity_1.Earning,
        note_entity_1.Note,
    ],
    migrations: ['src/database/migrations/*.ts'],
    synchronize: false,
});
//# sourceMappingURL=data-source.js.map