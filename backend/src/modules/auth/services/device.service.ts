import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UAParser } from 'ua-parser-js';
import { UserIpLog } from '../../../database/entities/user-ip-log.entity';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(UserIpLog)
    private userIpLogsRepository: Repository<UserIpLog>,
  ) {}

  async logIpAddress(
    userId: string,
    ip: string,
    userAgent: string,
    provider: string = 'unknown',
  ) {
    const log = this.userIpLogsRepository.create({
      userId,
      ipAddress: ip,
      userAgent,
      provider,
    });
    await this.userIpLogsRepository.save(log);
  }

  parseDeviceInfo(userAgent?: string, deviceName?: string): {
    browser?: string; os?: string; deviceName?: string;
  } {
    if (!userAgent) return { deviceName };
    const res = new UAParser(userAgent).getResult();
    const browser = res.browser.name
      ? `${res.browser.name} ${res.browser.version || ''}`.trim()
      : undefined;
    const os = res.os.name
      ? `${res.os.name} ${res.os.version || ''}`.trim()
      : undefined;
    const derived = deviceName
      ?? (res.device.vendor && res.device.model
        ? `${res.device.vendor} ${res.device.model}`
        : res.os.name ?? 'Unknown Device');
    return { browser, os, deviceName: derived };
  }
}
