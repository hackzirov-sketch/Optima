'use client';

import { ReactNode } from 'react';
import { useRBAC } from '@/hooks/useRBAC';

interface RoleGuardProps {
  children: ReactNode;
  requireRole?: string | string[];
  requirePermission?: string | string[];
  fallback?: ReactNode;
}

export function RoleGuard({ children, requireRole, requirePermission, fallback = null }: RoleGuardProps) {
  const { hasRole, hasPermission } = useRBAC();

  if (requireRole && !hasRole(requireRole)) {
    return <>{fallback}</>;
  }

  if (requirePermission && !hasPermission(requirePermission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
