import { Global, Module } from '@nestjs/common';
import { PermissionService } from './services/permission.service';
import { AuditService } from './services/audit.service';

@Global()
@Module({
  providers: [PermissionService, AuditService],
  exports: [PermissionService, AuditService],
})
export class CommonModule {}
