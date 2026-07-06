import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { EarningsService } from './earnings.service';
import { EarningsController } from './earnings.controller';

@Module({
  imports: [WorkspacesModule],
  controllers: [EarningsController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
