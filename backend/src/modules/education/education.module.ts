import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChatModule } from '../chat/chat.module';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { EducationAdminController } from './education-admin.controller';
import { EducationSyncService } from './education-sync.service';
import { EducationSyncProcessor } from './education-sync.processor';

@Module({
  imports: [ChatModule, BullModule.registerQueue({ name: 'education' })],
  controllers: [EducationController, EducationAdminController],
  providers: [EducationService, EducationSyncService, EducationSyncProcessor],
})
export class EducationModule {}
