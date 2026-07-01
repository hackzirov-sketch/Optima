import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionService } from './services/permission.service';
import { AuditService } from './services/audit.service';
import { AuditLog } from '../database/entities/audit-log.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [PermissionService, AuditService],
  exports: [PermissionService, AuditService],
})
export class CommonModule {}
