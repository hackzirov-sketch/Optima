import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { ChatRoom } from '../../database/entities/chat-room.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRole, ChatRoomType } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import {
  applySoftDelete,
  isActiveEntity,
  isSoftDeleted,
} from '../../common/utils/soft-delete';
import { PermissionService } from '../../common/services/permission.service';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatMember)
    private readonly chatMemberRepo: Repository<ChatMember>,
    private readonly dataSource: DataSource,
    private readonly permission: PermissionService,
  ) {}

  private async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const member = await this.memberRepo.findOne({ where: { workspaceId, userId } });
    if (!member) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Not a workspace member',
      });
    }
    return member;
  }

  async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    const existing = await this.workspaceRepo.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.WORKSPACE_SLUG_TAKEN,
        message: 'Workspace slug is already taken',
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create Workspace
      const workspace = this.workspaceRepo.create({
        ...dto,
        ownerId: userId,
      });
      const savedWorkspace = await queryRunner.manager.save(workspace);

      // Add owner as a member with OWNER role
      const member = this.memberRepo.create({
        workspaceId: savedWorkspace.id,
        userId: userId,
        role: WorkspaceRole.OWNER,
      });
      await queryRunner.manager.save(member);

      // Create default #general workspace channel
      const generalRoom = this.chatRoomRepo.create({
        workspaceId: savedWorkspace.id,
        type: ChatRoomType.WORKSPACE,
        name: 'general',
        createdById: userId,
      });
      const savedRoom = await queryRunner.manager.save(generalRoom);

      // Add owner to the channel
      const chatMember = this.chatMemberRepo.create({
        roomId: savedRoom.id,
        userId: userId,
      });
      await queryRunner.manager.save(chatMember);

      await queryRunner.commitTransaction();
      return savedWorkspace;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create workspace', error instanceof Error ? error.stack : error);
      throw new InternalServerErrorException({ code: ErrorCode.INTERNAL_ERROR, message: 'Failed to create workspace' });
    } finally {
      await queryRunner.release();
    }
  }

  async findAllForUser(userId: string): Promise<Workspace[]> {
    // Find all workspaces where the user is a member
    const members = await this.memberRepo.find({
      where: { userId },
      relations: ['workspace'],
    });
    return members
      .map((m) => m.workspace)
      .filter((ws) => ws && !isSoftDeleted(ws));
  }

  async findById(id: string): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findOne({ where: { id } });
    if (!isActiveEntity(workspace)) {
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });
    }
    return workspace;
  }

  async findBySlug(slug: string, userId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findOne({ where: { slug } });
    if (!isActiveEntity(workspace)) {
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });
    }
    // Ensure requesting user is actually a member of this workspace
    const member = await this.memberRepo.findOne({
      where: { workspaceId: workspace.id, userId },
    });
    if (!member) {
      throw new ForbiddenException({ code: ErrorCode.WORKSPACE_ACCESS_DENIED, message: 'Access denied to this workspace' });
    }
    return workspace;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    const workspace = await this.findById(id);
    const member = await this.getMember(id, userId);
    this.permission.assertCanManageWorkspace(member);

    if (dto.slug && dto.slug !== workspace.slug) {
      const existing = await this.workspaceRepo.findOne({
        where: { slug: dto.slug },
      });
      if (existing) {
        throw new ConflictException({
          code: ErrorCode.WORKSPACE_SLUG_TAKEN,
          message: 'Workspace slug is already taken',
        });
      }
    }

    Object.assign(workspace, dto);
    return this.workspaceRepo.save(workspace);
  }

  /** Soft-delete workspace. Only role === OWNER (access control via PermissionService, not ownerId). */
  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findById(id);
    const member = await this.getMember(id, userId);
    this.permission.assertCanDeleteWorkspace(member);
    applySoftDelete(workspace, userId);
    await this.workspaceRepo.save(workspace);
  }

  /**
   * Transfer workspace ownership to another member.
   * Invariant: there is always exactly one OWNER.
   * 1. Only the current OWNER can initiate the transfer.
   * 2. Single DB transaction: old OWNER → ADMIN, new member → OWNER, workspace.ownerId updated (audit only).
   */
  async transferOwnership(
    workspaceId: string,
    currentOwnerId: string,
    newOwnerUserId: string,
  ): Promise<Workspace> {
    const workspace = await this.findById(workspaceId);
    const currentOwnerMember = await this.getMember(workspaceId, currentOwnerId);

    if (currentOwnerMember.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_OWNER,
        message: 'Only the current workspace owner can transfer ownership',
      });
    }

    if (newOwnerUserId === currentOwnerId) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'New owner must be a different member',
      });
    }

    const newOwnerMember = await this.memberRepo.findOne({
      where: { workspaceId, userId: newOwnerUserId },
    });
    if (!newOwnerMember) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Target user is not a member of this workspace',
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      currentOwnerMember.role = WorkspaceRole.ADMIN;
      await queryRunner.manager.save(currentOwnerMember);

      newOwnerMember.role = WorkspaceRole.OWNER;
      await queryRunner.manager.save(newOwnerMember);

      workspace.ownerId = newOwnerUserId; // audit / billing record only
      const savedWorkspace = await queryRunner.manager.save(workspace);

      await queryRunner.commitTransaction();
      return savedWorkspace;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to transfer ownership',
      });
    } finally {
      await queryRunner.release();
    }
  }
}
