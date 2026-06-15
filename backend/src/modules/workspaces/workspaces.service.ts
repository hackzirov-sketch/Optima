import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
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
import {
  assertWorkspaceBillingOwner,
  assertWorkspaceManager,
} from '../../common/utils/workspace-auth';

@Injectable()
export class WorkspacesService {
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
  ) {}

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
    const member = await this.memberRepo.findOne({
      where: { workspaceId: id, userId },
    });
    assertWorkspaceManager(workspace, userId, member);

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

  /** Soft-delete workspace. Only billing owner (`ownerId`), not ADMIN members. */
  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findById(id);
    assertWorkspaceBillingOwner(workspace, userId);
    applySoftDelete(workspace, userId);
    await this.workspaceRepo.save(workspace);
  }
}
