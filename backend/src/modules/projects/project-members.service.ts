import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectMember } from '../../database/entities/project-member.entity';
import { Project } from '../../database/entities/project.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { PermissionService } from '../../common/services/permission.service';

@Injectable()
export class ProjectMembersService {
  constructor(
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly permission: PermissionService,
  ) {}

  private async getProject(projectId: string): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project || project.deletedAt) {
      throw new NotFoundException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not found' });
    }
    return project;
  }

  private async assertProjectManager(projectId: string, userId: string): Promise<Project> {
    const project = await this.getProject(projectId);

    // Project creator is always a manager
    if (project.createdById === userId) return project;

    // Or workspace LEAD+ role
    const wsMember = await this.wsMemberRepo.findOne({
      where: { workspaceId: project.workspaceId, userId },
    });
    if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
    this.permission.assertCanManageProject(wsMember);

    return project;
  }

  async listMembers(projectId: string, requesterId: string) {
    const project = await this.getProject(projectId);
    const wsMember = await this.wsMemberRepo.findOne({
      where: { workspaceId: project.workspaceId, userId: requesterId },
    });
    if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });

    const members = await this.memberRepo.find({
      where: { projectId },
      relations: ['user', 'inviter'],
      order: { invitedAt: 'ASC' },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      status: m.status,
      invitedBy: m.invitedBy,
      invitedAt: m.invitedAt,
      joinedAt: m.joinedAt,
      user: m.user
        ? { id: m.user.id, firstName: m.user.firstName, lastName: m.user.lastName, avatarUrl: m.user.avatarUrl, email: m.user.email }
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
    const wsTarget = await this.wsMemberRepo.findOne({
      where: { workspaceId: project.workspaceId, userId: targetUserId },
    });
    if (!wsTarget) throw new NotFoundException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Target user is not a workspace member' });

    // Check not already a member
    const existing = await this.memberRepo.findOne({ where: { projectId, userId: targetUserId } });
    if (existing) {
      throw new ConflictException({ code: ErrorCode.ALREADY_ROOM_MEMBER, message: 'User is already a project member' });
    }

    const saved = await this.memberRepo.save(
      this.memberRepo.create({
        projectId,
        userId: targetUserId,
        role,
        status: 'pending',
        invitedBy: inviterId,
      }),
    );

    const inviter = await this.userRepo.findOne({ where: { id: inviterId } });
    const inviterName = inviter ? `${inviter.firstName ?? ''} ${inviter.lastName ?? ''}`.trim() : 'Someone';

    await this.notifications.create({
      userId: targetUserId,
      actorId: inviterId,
      type: NotificationType.PROJECT_MEMBER_INVITE,
      title: `"${project.name}" loyihasiga taklif`,
      message: `${inviterName} sizni "${project.name}" loyihasiga ${role === 'manager' ? 'menejer' : 'a\'zo'} sifatida taklif qildi`,
      entityType: 'project_member',
      entityId: saved.id,
      actionUrl: `/app/projects/${projectId}`,
      metadata: { projectId, projectName: project.name, role, memberId: saved.id },
    });

    return saved;
  }

  async respondToInvite(memberId: string, userId: string, accept: boolean) {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, userId },
      relations: ['project'],
    });
    if (!member) throw new NotFoundException({ code: ErrorCode.MEMBER_NOT_FOUND, message: 'Invite not found' });
    if (member.status !== 'pending') {
      throw new ConflictException({ code: ErrorCode.INSUFFICIENT_PERMISSIONS, message: 'Invite already responded' });
    }

    member.status = accept ? 'accepted' : 'declined';
    if (accept) member.joinedAt = new Date();
    const saved = await this.memberRepo.save(member);

    // Notify project creator + managers
    const project = await this.projectRepo.findOne({ where: { id: member.projectId } });
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const userName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : 'Someone';

    const notifType = accept ? NotificationType.PROJECT_MEMBER_ACCEPTED : NotificationType.PROJECT_MEMBER_DECLINED;
    const notifTitle = accept
      ? `${userName} loyihaga qo'shildi`
      : `${userName} taklifni rad etdi`;

    const managersToNotify = new Set<string>();
    if (project?.createdById && project.createdById !== userId) managersToNotify.add(project.createdById);

    const otherManagers = await this.memberRepo.find({
      where: { projectId: member.projectId, role: 'manager', status: 'accepted' },
    });
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
          message: `${userName} "${project?.name ?? 'loyiha'}"ga ${accept ? 'qo\'shildi' : 'qo\'shilmadi'}`,
          entityType: 'project',
          entityId: member.projectId,
          actionUrl: `/app/projects/${member.projectId}`,
        }),
      ),
    );

    return saved;
  }

  async removeMember(projectId: string, targetUserId: string, requesterId: string) {
    await this.assertProjectManager(projectId, requesterId);
    const member = await this.memberRepo.findOne({ where: { projectId, userId: targetUserId } });
    if (!member) throw new NotFoundException({ code: ErrorCode.MEMBER_NOT_FOUND, message: 'Member not found' });
    await this.memberRepo.remove(member);
  }

  async getMyInvites(userId: string) {
    const members = await this.memberRepo.find({
      where: { userId, status: 'pending' },
      relations: ['project'],
      order: { invitedAt: 'DESC' },
    });
    return members.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      projectName: m.project?.name ?? '',
      role: m.role,
      invitedBy: m.invitedBy,
      invitedAt: m.invitedAt,
    }));
  }
}
