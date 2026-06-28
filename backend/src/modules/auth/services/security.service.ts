import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SecurityService {
  private readonly bcryptRounds: number;

  constructor(private configService: ConfigService) {
    this.bcryptRounds = this.configService.get<number>('app.bcryptRounds') ?? 12;
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.bcryptRounds);
  }

  async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
