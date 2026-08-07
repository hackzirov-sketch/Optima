import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Project } from '../../database/entities/project.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { PermissionService } from '../../common/services/permission.service';
import { PROJECT_COLUMNS_SQL } from './projects.sql';

const PROJECT_MEMBER_COLUMNS_SQL = `
  id, project_id AS "projectId", user_id AS "userId", role, status,
  invited_by AS "invitedBy", invited_at AS "invitedAt", joined_at AS "joinedAt"
`;

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly permission: PermissionService,
  ) {}

  private async getProject(projectId: string): Promise<Project> {
    const rows = await this.dataSource.query<Project>(
      `SELECT ${PROJECT_COLUMNS_SQL} FROM projects WHERE id = $1`,
      [projectId],
    );
    const project = rows[0];
    if (!project || project.deletedAt) {
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found',
      });
    }
    return project;
  }

  private async getWorkspaceMember(workspaceId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role
       FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    return rows[0] ?? null;
  }

  private async assertProjectManager(
    projectId: string,
    userId: string,
  ): Promise<Project> {
    const project = await this.getProject(projectId);

    // Project creator is always a manager
    if (project.createdById === userId) return project;

    // Or workspace LEAD+ role
    const wsMember = await this.getWorkspaceMember(project.workspaceId, userId);
    if (!wsMember)
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Not a workspace member',
      });
    this.permission.assertCanManageProject(wsMember);

    return project;
  }

  async listMembers(projectId: string, requesterId: string) {
    const project = await this.getProject(projectId);
    const wsMember = await this.getWorkspaceMember(
      project.workspaceId,
      requesterId,
    );
    if (!wsMember)
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Not a workspace member',
      });

    const rows = await this.dataSource.query<any>(
      `SELECT
         pm.id AS "id", pm.user_id AS "userId", pm.role, pm.status,
         pm.invited_by AS "invitedBy", pm.invited_at AS "invitedAt", pm.joined_at AS "joinedAt",
         u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
         u.avatar_url AS "u_avatarUrl", u.email AS "u_email"
       FROM project_members pm
       LEFT JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY pm.invited_at ASC`,
      [projectId],
    );

    return rows.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      status: m.status,
      invitedBy: m.invitedBy,
      invitedAt: m.invitedAt,
      joinedAt: m.joinedAt,
      user: m.u_id
        ? {
            id: m.u_id,
            firstName: m.u_firstName,
            lastName: m.u_lastName,
            avatarUrl: m.u_avatarUrl,
            email: m.u_email,
          }
        : null,
    }));
  }

  async inviteMember(
    projectId: string,
    targetUserId: string,
    role: 'manager' | 'member',
    inviterId: string,
  ) {
    const project = await this.assertProjectManager(projectId, inviterId);

    // Target must be workspace member
    const wsTarget = await this.getWorkspaceMember(
      project.workspaceId,
      targetUserId,
    );
    if (!wsTarget)
      throw new NotFoundException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Target user is not a workspace member',
      });

    // Check not already a member
    const existing = await this.dataSource.query(
      `SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, targetUserId],
    );
    if (existing[0]) {
      throw new ConflictException({
        code: ErrorCode.ALREADY_ROOM_MEMBER,
        message: 'User is already a project member',
      });
    }

    const savedRows = await this.dataSource.query(
      `INSERT INTO project_members (project_id, user_id, role, status, invited_by)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING ${PROJECT_MEMBER_COLUMNS_SQL}`,
      [projectId, targetUserId, role, inviterId],
    );
    const saved = savedRows[0];

    const inviterRows = await this.dataSource.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id = $1`,
      [inviterId],
    );
    const inviter = inviterRows[0];
    const inviterName = inviter
      ? `${inviter.firstName ?? ''} ${inviter.lastName ?? ''}`.trim()
      : 'Someone';

    await this.notifications.create({
      userId: targetUserId,
      actorId: inviterId,
      type: NotificationType.PROJECT_MEMBER_INVITE,
      title: `"${project.name}" loyihasiga taklif`,
      message: `${inviterName} sizni "${project.name}" loyihasiga ${role === 'manager' ? 'menejer' : "a'zo"} sifatida taklif qildi`,
      entityType: 'project_member',
      entityId: saved.id,
      actionUrl: `/app/projects/${projectId}`,
      metadata: {
        projectId,
        projectName: project.name,
        role,
        memberId: saved.id,
      },
    });

    return saved;
  }

  async respondToInvite(memberId: string, userId: string, accept: boolean) {
    const memberRows = await this.dataSource.query(
      `SELECT ${PROJECT_MEMBER_COLUMNS_SQL} FROM project_members WHERE id = $1 AND user_id = $2`,
      [memberId, userId],
    );
    const member = memberRows[0];
    if (!member)
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Invite not found',
      });
    if (member.status !== 'pending') {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Invite already responded',
      });
    }

    const newStatus = accept ? 'accepted' : 'declined';
    const savedRows = await this.dataSource.query(
      `UPDATE project_members SET status = $2, joined_at = $3 WHERE id = $1
         RETURNING ${PROJECT_MEMBER_COLUMNS_SQL}`,
      [memberId, newStatus, accept ? new Date() : null],
    );
    const saved = savedRows[0];

    // Notify project creator + managers
    const project = await this.getProject(member.projectId).catch(() => null);
    const userRows = await this.dataSource.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id = $1`,
      [userId],
    );
    const user = userRows[0];
    const userName = user
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : 'Someone';

    const notifType = accept
      ? NotificationType.PROJECT_MEMBER_ACCEPTED
      : NotificationType.PROJECT_MEMBER_DECLINED;
    const notifTitle = accept
      ? `${userName} loyihaga qo'shildi`
      : `${userName} taklifni rad etdi`;

    const managersToNotify = new Set<string>();
    if (project?.createdById && project.createdById !== userId)
      managersToNotify.add(project.createdById);

    const otherManagers = await this.dataSource.query(
      `SELECT user_id AS "userId" FROM project_members WHERE project_id = $1 AND role = 'manager' AND status = 'accepted'`,
      [member.projectId],
    );
    for (const m of otherManagers) {
      if (m.userId !== userId) managersToNotify.add(m.userId);
    }

    await Promise.all(
      Array.from(managersToNotify).map((recipientId) =>
        this.notifications.create({
          userId: recipientId,
          actorId: userId,
          type: notifType,
          title: notifTitle,
          message: `${userName} "${project?.name ?? 'loyiha'}"ga ${accept ? "qo'shildi" : "qo'shilmadi"}`,
          entityType: 'project',
          entityId: member.projectId,
          actionUrl: `/app/projects/${member.projectId}`,
        }),
      ),
    );

    return saved;
  }

  async removeMember(
    projectId: string,
    targetUserId: string,
    requesterId: string,
  ) {
    await this.assertProjectManager(projectId, requesterId);
    const member = await this.dataSource.query(
      `SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, targetUserId],
    );
    if (!member[0])
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Member not found',
      });
    await this.dataSource.query(
      `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, targetUserId],
    );
  }

  async getMyInvites(userId: string) {
    const rows = await this.dataSource.query<any>(
      `SELECT
         pm.id AS "id", pm.project_id AS "projectId", pm.role, pm.invited_by AS "invitedBy",
         pm.invited_at AS "invitedAt", p.name AS "projectName"
       FROM project_members pm
       LEFT JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = $1 AND pm.status = 'pending'
       ORDER BY pm.invited_at DESC`,
      [userId],
    );
    return rows.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      projectName: m.projectName ?? '',
      role: m.role,
      invitedBy: m.invitedBy,
      invitedAt: m.invitedAt,
    }));
  }
}
