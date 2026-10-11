import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EventsGateway } from './events.gateway';

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly gateway: EventsGateway) {}

  /**
   * Called right after the client refreshes its session: this request carries
   * the new access cookie, and the client's open socket is switched onto it
   * instead of being dropped when its handshake token expires.
   */
  @Post('renew')
  @HttpCode(200)
  async renew(
    @Body() body: { socketId?: string },
    @Req() req: Request,
    @CurrentUser('id') _userId: string,
  ) {
    const socketId = typeof body?.socketId === 'string' ? body.socketId.slice(0, 64) : '';
    return { renewed: socketId ? await this.gateway.renewSocketAuth(socketId, req.headers.cookie) : false };
  }
}
