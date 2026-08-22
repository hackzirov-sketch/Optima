import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { EarningsService } from './earnings.service';
import { EarningsController } from './earnings.controller';

@Module({
  imports: [GroupsModule],
  controllers: [EarningsController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
