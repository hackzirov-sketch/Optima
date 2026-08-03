import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { UAParser } from 'ua-parser-js';

@Injectable()
export class DeviceService {
  constructor(private dataSource: DatabaseService) {}

  async logIpAddress(
    userId: string,
    ip: string,
    userAgent: string,
    provider: string = 'unknown',
  ) {
    await this.dataSource.query(
      `INSERT INTO user_ip_logs (user_id, ip_address, user_agent, provider)
       VALUES ($1, $2, $3, $4)`,
      [userId, ip, userAgent, provider],
    );
  }

  parseDeviceInfo(
    userAgent?: string,
    deviceName?: string,
  ): {
    browser?: string;
    os?: string;
    deviceName?: string;
  } {
    if (!userAgent) return { deviceName };
    const res = new UAParser(userAgent).getResult();
    const browser = res.browser.name
      ? `${res.browser.name} ${res.browser.version || ''}`.trim()
      : undefined;
    const os = res.os.name
      ? `${res.os.name} ${res.os.version || ''}`.trim()
      : undefined;
    const derived =
      deviceName ??
      (res.device.vendor && res.device.model
        ? `${res.device.vendor} ${res.device.model}`
        : (res.os.name ?? 'Unknown Device'));
    return { browser, os, deviceName: derived };
  }
}
