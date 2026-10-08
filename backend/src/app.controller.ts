import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get(['health'])
  getHealth() {
    return {
      ok: true,
      service: 'optima backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get()
  getHello(): string {
    return 'Optima backend is running';
  }
}
