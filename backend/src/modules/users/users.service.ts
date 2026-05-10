import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { UserSettings } from '../../database/entities/user-settings.entity';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private settingsRepository: Repository<UserSettings>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }
    return user;
  }
  
  async findByIdWithRelations(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['settings', 'workspaceMemberships', 'workspaceMemberships.workspace'],
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }
    
    // Formatting workspace memberships so it's cleaner in the response
    const workspaces = user.workspaceMemberships.map(m => ({
      role: m.role,
      joinedAt: m.joinedAt,
      ...m.workspace
    }));
    
    // Remove the verbose array and attach the clean workspaces array
    user.workspaceMemberships = undefined as any;
    (user as any).workspaces = workspaces;

    return user;
  }
      
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    await this.usersRepository.update(id, data);
  }

  async updateLastSeen(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { lastSeen: new Date() });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    await this.usersRepository.update(userId, dto);
    return this.findById(userId);
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<UserSettings> {
    await this.settingsRepository.update({ userId }, dto);
    const settings = await this.settingsRepository.findOne({ where: { userId } });
    if (!settings) {
      throw new NotFoundException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Settings not found',
      });
    }
    return settings;
  }
}
