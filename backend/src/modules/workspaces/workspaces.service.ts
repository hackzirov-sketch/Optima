import {
  Injectable,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRole } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
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

      await queryRunner.commitTransaction();
      return savedWorkspace;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('Failed to create workspace');
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
    return members.map((m) => m.workspace).filter((ws) => ws.deletedAt == null);
  }

  async findById(id: string): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findOne({ where: { id } });
    if (!workspace || workspace.deletedAt) {
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });
    }
    return workspace;
  }

  async findBySlug(slug: string): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findOne({ where: { slug } });
    if (!workspace || workspace.deletedAt) {
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });
    }
    return workspace;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    const workspace = await this.findById(id);

    // Authorization check would typically happen in a guard, but doing a basic check here
    if (workspace.ownerId !== userId) {
      const member = await this.memberRepo.findOne({
        where: { workspaceId: id, userId },
      });
      if (
        !member ||
        (member.role !== WorkspaceRole.OWNER &&
          member.role !== WorkspaceRole.ADMIN)
      ) {
        throw new ConflictException({
          code: ErrorCode.INSUFFICIENT_PERMISSIONS,
          message: 'Not allowed to update workspace',
        });
      }
    }

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

  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findById(id);

    if (workspace.ownerId !== userId) {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Only the owner can delete the workspace',
      });
    }

    workspace.deletedAt = new Date();
    workspace.deletedBy = userId;
    await this.workspaceRepo.save(workspace);
  }
}
