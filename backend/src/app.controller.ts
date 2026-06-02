import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get(['health', 'healt'])
  getHealth() {
    return {
      ok: true,
      service: 'upz-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get()
  getHello(): string {
    return 'UPZ backend is running';
  }
}
