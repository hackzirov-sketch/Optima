import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { EducationAdminController } from './education-admin.controller';
import { EducationSyncService } from './education-sync.service';

@Module({ imports: [ChatModule], controllers: [EducationController, EducationAdminController], providers: [EducationService, EducationSyncService] })
export class EducationModule {}
