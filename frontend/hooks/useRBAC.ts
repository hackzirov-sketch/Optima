import { useAuth } from './useAuth';

type Role = 'admin' | 'manager' | 'user' | string;
type Permission = 'read' | 'write' | 'delete' | 'manage_users' | string;

// Example permission mapping (in a real app, this might come from the backend)
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: ['read', 'write', 'delete', 'manage_users'],
  manager: ['read', 'write'],
  user: ['read'],
};

export function useRBAC() {
  const { user } = useAuth();
  const userRole = user?.role || 'user'; // Default to 'user' if no role is set

  const hasRole = (roles: Role | Role[]): boolean => {
    if (!userRole) return false;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    return allowedRoles.includes(userRole);
  };

  const hasPermission = (permissions: Permission | Permission[]): boolean => {
    if (!userRole) return false;
    
    // Admins usually have all permissions
    if (userRole === 'admin') return true;

    const userPermissions = ROLE_PERMISSIONS[userRole] || [];
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

    return requiredPermissions.every(p => userPermissions.includes(p));
  };

  return {
    userRole,
    hasRole,
    hasPermission,
  };
}
