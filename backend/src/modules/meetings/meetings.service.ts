import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Meeting } from '../../database/entities/meeting.entity';
import { MeetingParticipant } from '../../database/entities/meeting-participant.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingStatus, MeetingParticipantRole } from '../../common/enums/meeting.enum';

function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `UPZ-${segment(3)}-${segment(4)}`;
}

@Injectable()
export class MeetingsService {
  constructor(
    @InjectRepository(Meeting)
    private readonly meetingRepo: Repository<Meeting>,
    @InjectRepository(MeetingParticipant)
    private readonly participantRepo: Repository<MeetingParticipant>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
  ) {}

  private async assertWsMember(workspaceId: string, userId: string) {
    const m = await this.wsMemberRepo.findOne({ where: { workspaceId, userId } });
    if (!m) throw new ForbiddenException('Not a workspace member');
    return m;
  }

  private async assertHost(meetingId: string, userId: string) {
    const m = await this.meetingRepo.findOne({ where: { id: meetingId } });
    if (!m) throw new NotFoundException('Meeting not found');
    if (m.hostId !== userId)
      throw new ForbiddenException('Only the host can perform this action');
    return m;
  }

  private enrichMeeting(meeting: Meeting, participants: MeetingParticipant[]) {
    return {
      id: meeting.id,
      workspaceId: meeting.workspaceId,
      hostId: meeting.hostId,
      host: meeting.host
        ? {
            id: meeting.host.id,
            firstName: (meeting.host as any).firstName,
            lastName: (meeting.host as any).lastName,
            avatarUrl: (meeting.host as any).avatarUrl,
          }
        : null,
      title: meeting.title,
      description: meeting.description ?? null,
      meetingCode: meeting.meetingCode,
      status: meeting.status,
      startTime: meeting.startTime,
      endTime: meeting.endTime ?? null,
      maxParticipants: meeting.maxParticipants,
      isRecurring: meeting.isRecurring,
      agenda: meeting.agenda ?? null,
      participantCount: participants.filter((p) => !p.leftAt).length,
      participants: participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        role: p.role,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt ?? null,
        isMuted: p.isMuted,
        cameraEnabled: p.cameraEnabled,
        screenSharing: p.screenSharing,
      })),
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  }

  async listForWorkspace(workspaceId: string, userId: string) {
    await this.assertWsMember(workspaceId, userId);

    const meetings = await this.meetingRepo.find({
      where: { workspaceId },
      relations: ['host'],
      order: { startTime: 'DESC' },
    });

    const meetingIds = meetings.map((m) => m.id);
    if (!meetingIds.length) return [];

    const participants = await this.participantRepo.find({
      where: { meetingId: In(meetingIds) },
    });

    // group participants by meetingId
    const byMeeting = new Map<string, MeetingParticipant[]>();
    for (const p of participants) {
      if (!byMeeting.has(p.meetingId)) byMeeting.set(p.meetingId, []);
      byMeeting.get(p.meetingId)!.push(p);
    }

    return meetings.map((m) => this.enrichMeeting(m, byMeeting.get(m.id) ?? []));
  }

  async create(workspaceId: string, userId: string, dto: CreateMeetingDto) {
    await this.assertWsMember(workspaceId, userId);

    let code: string;
    let attempts = 0;
    do {
      code = generateMeetingCode();
      attempts++;
      if (attempts > 10) throw new BadRequestException('Could not generate unique meeting code');
    } while (await this.meetingRepo.findOne({ where: { meetingCode: code } }));

    const meeting = this.meetingRepo.create({
      workspaceId,
      hostId: userId,
      title: dto.title,
      description: dto.description,
      meetingCode: code,
      startTime: new Date(dto.startTime),
      endTime: dto.endTime ? new Date(dto.endTime) : undefined,
      maxParticipants: dto.maxParticipants ?? 100,
      isRecurring: dto.isRecurring ?? false,
      agenda: dto.agenda,
    });
    const saved = await this.meetingRepo.save(meeting);

    // Host auto-joins as host
    const participant = this.participantRepo.create({
      meetingId: saved.id,
      userId,
      role: MeetingParticipantRole.HOST,
      joinedAt: new Date(),
    });
    await this.participantRepo.save(participant);

    const full = await this.meetingRepo.findOne({
      where: { id: saved.id },
      relations: ['host'],
    });
    const participants = await this.participantRepo.find({ where: { meetingId: saved.id } });
    return this.enrichMeeting(full!, participants);
  }

  async getOne(meetingId: string, userId: string) {
    const meeting = await this.meetingRepo.findOne({
      where: { id: meetingId },
      relations: ['host'],
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.assertWsMember(meeting.workspaceId, userId);

    const participants = await this.participantRepo.find({ where: { meetingId } });
    return this.enrichMeeting(meeting, participants);
  }

  async update(meetingId: string, userId: string, dto: UpdateMeetingDto) {
    const meeting = await this.assertHost(meetingId, userId);
    if (meeting.status === MeetingStatus.ENDED || meeting.status === MeetingStatus.CANCELLED) {
      throw new ForbiddenException('Cannot update a finished meeting');
    }

    if (dto.title !== undefined) meeting.title = dto.title;
    if (dto.description !== undefined) meeting.description = dto.description;
    if (dto.startTime !== undefined) meeting.startTime = new Date(dto.startTime);
    if (dto.endTime !== undefined) meeting.endTime = new Date(dto.endTime);
    if (dto.status !== undefined) meeting.status = dto.status;
    if (dto.maxParticipants !== undefined) meeting.maxParticipants = dto.maxParticipants;
    if (dto.isRecurring !== undefined) meeting.isRecurring = dto.isRecurring;
    if (dto.agenda !== undefined) meeting.agenda = dto.agenda;

    const saved = await this.meetingRepo.save(meeting);
    const full = await this.meetingRepo.findOne({ where: { id: saved.id }, relations: ['host'] });
    const participants = await this.participantRepo.find({ where: { meetingId: saved.id } });
    return this.enrichMeeting(full!, participants);
  }

  async remove(meetingId: string, userId: string) {
    const meeting = await this.assertHost(meetingId, userId);
    meeting.status = MeetingStatus.CANCELLED;
    await this.meetingRepo.save(meeting);
  }

  async join(meetingId: string, userId: string) {
    const meeting = await this.meetingRepo.findOne({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status === MeetingStatus.ENDED || meeting.status === MeetingStatus.CANCELLED) {
      throw new ForbiddenException('Meeting is no longer active');
    }
    await this.assertWsMember(meeting.workspaceId, userId);

    const existing = await this.participantRepo.findOne({
      where: { meetingId, userId },
    });
    if (existing) {
      // Re-joining after leaving
      existing.joinedAt = new Date();
      existing.leftAt = null as any;
      await this.participantRepo.save(existing);
      return { joined: true, participantId: existing.id };
    }

    const activeCount = await this.participantRepo.count({
      where: { meetingId, leftAt: IsNull() },
    });
    if (activeCount >= meeting.maxParticipants) {
      throw new ConflictException('Meeting is at full capacity');
    }

    // Auto-start meeting when first non-host joins
    if (meeting.status === MeetingStatus.SCHEDULED) {
      meeting.status = MeetingStatus.LIVE;
      await this.meetingRepo.save(meeting);
    }

    const participant = this.participantRepo.create({
      meetingId,
      userId,
      role: MeetingParticipantRole.PARTICIPANT,
      joinedAt: new Date(),
    });
    const saved = await this.participantRepo.save(participant);
    return { joined: true, participantId: saved.id };
  }

  async leave(meetingId: string, userId: string) {
    const participant = await this.participantRepo.findOne({
      where: { meetingId, userId, leftAt: IsNull() },
    });
    if (!participant) throw new NotFoundException('You are not in this meeting');

    participant.leftAt = new Date();
    await this.participantRepo.save(participant);

    // If host leaves and meeting is live, end it
    const meeting = await this.meetingRepo.findOne({ where: { id: meetingId } });
    if (meeting && meeting.hostId === userId && meeting.status === MeetingStatus.LIVE) {
      meeting.status = MeetingStatus.ENDED;
      meeting.endTime = new Date();
      await this.meetingRepo.save(meeting);
    }

    return { left: true };
  }

  async joinByCode(code: string, userId: string) {
    const meeting = await this.meetingRepo.findOne({
      where: { meetingCode: code.toUpperCase() },
    });
    if (!meeting) throw new NotFoundException('Meeting not found with this code');
    return this.join(meeting.id, userId);
  }
}
