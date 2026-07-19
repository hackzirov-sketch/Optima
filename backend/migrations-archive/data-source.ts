import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { UserSettings } from './entities/user-settings.entity';
import { GithubAccount } from './entities/github-account.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspaceGithubInstallation } from './entities/workspace-github-installation.entity';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { Repository } from './entities/repository.entity';
import { Project } from './entities/project.entity';
import { ProjectColumn } from './entities/project-column.entity';
import { Tag } from './entities/tag.entity';
import { Task } from './entities/task.entity';
import { TaskWatcher } from './entities/task-watcher.entity';
import { TaskTag } from './entities/task-tag.entity';
import { TaskDependency } from './entities/task-dependency.entity';
import { TaskActivity } from './entities/task-activity.entity';
import { TaskSequence } from './entities/task-sequence.entity';
import { TaskPush } from './entities/task-push.entity';
import { PushReviewComment } from './entities/push-review-comment.entity';
import { DeveloperProjectStats } from './entities/developer-project-stats.entity';
import { DeveloperDailyStats } from './entities/developer-daily-stats.entity';
import { ChatRoom } from './entities/chat-room.entity';
import { ChatMember } from './entities/chat-member.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatReaction } from './entities/chat-reaction.entity';
import { ChatRoomInvite } from './entities/chat-room-invite.entity';
import { MessageAttachment } from './entities/message-attachment.entity';
import { Notification } from './entities/notification.entity';
import { AuditLog } from './entities/audit-log.entity';
import { UserIpLog } from './entities/user-ip-log.entity';
import { UserVerification } from './entities/user-verification.entity';
import { Earning } from './entities/earning.entity';
import { Note } from './entities/note.entity';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    RefreshToken,
    UserSettings,
    GithubAccount,
    Workspace,
    WorkspaceMember,
    WorkspaceInvitation,
    WorkspaceGithubInstallation,
    Group,
    GroupMember,
    Repository,
    Project,
    ProjectColumn,
    Tag,
    Task,
    TaskWatcher,
    TaskTag,
    TaskDependency,
    TaskActivity,
    TaskSequence,
    TaskPush,
    PushReviewComment,
    DeveloperProjectStats,
    DeveloperDailyStats,
    ChatRoom,
    ChatMember,
    ChatMessage,
    ChatReaction,
    ChatRoomInvite,
    MessageAttachment,
    Notification,
    AuditLog,
    UserIpLog,
    UserVerification,
    Earning,
    Note,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
