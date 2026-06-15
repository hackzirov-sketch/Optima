import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from '../../database/entities/tag.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WorkspaceRole } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';

export class CreateTagDto {
  name!: string;
  color?: string;
}

export class UpdateTagDto {
  name?: string;
  color?: string;
}

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
  ) {}

  private async assertMember(workspaceId: string, userId: string) {
    const m = await this.wsMemberRepo.findOne({ where: { workspaceId, userId } });
    if (!m) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
    return m;
  }

  private async assertAdminOrOwner(workspaceId: string, userId: string) {
    const m = await this.assertMember(workspaceId, userId);
    if (m.role !== WorkspaceRole.OWNER && m.role !== WorkspaceRole.ADMIN && m.role !== WorkspaceRole.LEAD) {
      throw new ForbiddenException({ code: ErrorCode.INSUFFICIENT_PERMISSIONS, message: 'Only workspace admins/leads can manage tags' });
    }
    return m;
  }

  async listByWorkspace(workspaceId: string, userId: string): Promise<Tag[]> {
    await this.assertMember(workspaceId, userId);
    return this.tagRepo.find({ where: { workspaceId }, order: { name: 'ASC' } });
  }

  async create(workspaceId: string, userId: string, dto: CreateTagDto): Promise<Tag> {
    await this.assertAdminOrOwner(workspaceId, userId);

    const existing = await this.tagRepo.findOne({ where: { workspaceId, name: dto.name } });
    if (existing) throw new ConflictException({ code: ErrorCode.TAG_ALREADY_EXISTS, message: 'Tag with this name already exists in workspace' });

    const tag = this.tagRepo.create({
      workspaceId,
      name: dto.name,
      color: dto.color ?? '#6B7280',
      createdById: userId,
    });
    return this.tagRepo.save(tag);
  }

  async update(workspaceId: string, tagId: string, userId: string, dto: UpdateTagDto): Promise<Tag> {
    await this.assertAdminOrOwner(workspaceId, userId);

    const tag = await this.tagRepo.findOne({ where: { id: tagId, workspaceId } });
    if (!tag) throw new NotFoundException({ code: ErrorCode.TAG_NOT_FOUND, message: 'Tag not found' });

    if (dto.name && dto.name !== tag.name) {
      const existing = await this.tagRepo.findOne({ where: { workspaceId, name: dto.name } });
      if (existing) throw new ConflictException({ code: ErrorCode.TAG_ALREADY_EXISTS, message: 'Tag with this name already exists in workspace' });
    }

    Object.assign(tag, dto);
    return this.tagRepo.save(tag);
  }

  async remove(workspaceId: string, tagId: string, userId: string): Promise<void> {
    await this.assertAdminOrOwner(workspaceId, userId);

    const tag = await this.tagRepo.findOne({ where: { id: tagId, workspaceId } });
    if (!tag) throw new NotFoundException({ code: ErrorCode.TAG_NOT_FOUND, message: 'Tag not found' });

    await this.tagRepo.remove(tag);
  }
}
