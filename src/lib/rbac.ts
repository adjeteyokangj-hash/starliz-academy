import { AdminPermission } from '@prisma/client';
import { prisma } from './db';

/**
 * Default role configurations with their permissions
 */
export const DEFAULT_ROLES: Record<string, {
  description: string;
  permissions: AdminPermission[];
}> = {
  SUPER_ADMIN: {
    description: 'Full system access - can manage everything',
    permissions: [
      'MANAGE_USERS',
      'MANAGE_ADMINS',
      'MANAGE_ROLES',
      'VIEW_AUDIT_LOGS',
      'MANAGE_CONTENT',
      'APPROVE_CONTENT',
      'MANAGE_ASSIGNMENTS',
      'VIEW_PROGRESS',
      'MANAGE_BILLING',
      'MANAGE_SUBSCRIPTIONS',
      'MANAGE_INTEGRATIONS',
      'MANAGE_API_KEYS',
      'MANAGE_SETTINGS',
      'MANAGE_BRANDING',
      'MANAGE_SECURITY',
      'VIEW_REPORTS',
      'EXPORT_DATA',
      'ARCHIVE_RECORDS',
      'DELETE_RECORDS',
      'MANAGE_INBOX',
    ] as AdminPermission[],
  },
  ADMIN: {
    description: 'Can manage students, parents, assignments, content, reports, inbox. Cannot manage billing, API keys, integrations, or roles.',
    permissions: [
      'MANAGE_USERS',
      'MANAGE_CONTENT',
      'APPROVE_CONTENT',
      'MANAGE_ASSIGNMENTS',
      'VIEW_PROGRESS',
      'VIEW_REPORTS',
      'EXPORT_DATA',
      'ARCHIVE_RECORDS',
      'MANAGE_INBOX',
      'VIEW_AUDIT_LOGS',
    ] as AdminPermission[],
  },
  MANAGER: {
    description: 'Operational management - can manage content, assignments, reports, and student progress.',
    permissions: [
      'MANAGE_CONTENT',
      'MANAGE_ASSIGNMENTS',
      'VIEW_PROGRESS',
      'VIEW_REPORTS',
      'ARCHIVE_RECORDS',
    ] as AdminPermission[],
  },
  TUTOR: {
    description: 'Limited educational access - can view assigned students, create assignments, review progress, add notes.',
    permissions: [
      'MANAGE_ASSIGNMENTS',
      'VIEW_PROGRESS',
      'VIEW_REPORTS',
    ] as AdminPermission[],
  },
  AUDITOR: {
    description: 'Read-only access - can view reports, audit logs, compliance records, and operational activity.',
    permissions: [
      'VIEW_PROGRESS',
      'VIEW_REPORTS',
      'VIEW_AUDIT_LOGS',
      'EXPORT_DATA',
    ] as AdminPermission[],
  },
};

/**
 * Check if an admin user has a specific permission
 */
export async function hasPermission(
  adminUserId: string,
  permission: AdminPermission
): Promise<boolean> {
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminUserId },
      include: { role: true },
    });

    if (!admin || !admin.active || admin.isLocked) {
      return false;
    }

    if (!admin.role) {
      return false;
    }

    // Parse permissions from the stored JSON string
    let permissions: AdminPermission[] = [];
    try {
      permissions = JSON.parse(admin.role.permissions);
    } catch {
      permissions = [];
    }

    return permissions.includes(permission);
  } catch {
    return false;
  }
}

/**
 * Check if an admin user has multiple permissions (any)
 */
export async function hasAnyPermission(
  adminUserId: string,
  permissions: AdminPermission[]
): Promise<boolean> {
  for (const permission of permissions) {
    if (await hasPermission(adminUserId, permission)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an admin user has multiple permissions (all)
 */
export async function hasAllPermissions(
  adminUserId: string,
  permissions: AdminPermission[]
): Promise<boolean> {
  for (const permission of permissions) {
    if (!(await hasPermission(adminUserId, permission))) {
      return false;
    }
  }
  return true;
}

/**
 * Count active Super Admins in the system
 */
export async function countActiveSuperAdmins(): Promise<number> {
  const superAdminRole = await prisma.adminRole.findUnique({
    where: { name: 'SUPER_ADMIN' },
  });

  if (!superAdminRole) {
    return 0;
  }

  return await prisma.adminUser.count({
    where: {
      roleId: superAdminRole.id,
      active: true,
      isLocked: false,
    },
  });
}

/**
 * Check if deletion of an admin user is allowed
 * Prevents deletion of last Super Admin
 */
export async function canDeleteAdminUser(
  targetAdminId: string,
  requestingAdminId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Requesting admin cannot delete themselves without approval
  if (targetAdminId === requestingAdminId) {
    return {
      allowed: false,
      reason: 'Self-deletion requires second Super Admin approval. Use delete request workflow.',
    };
  }

  const targetAdmin = await prisma.adminUser.findUnique({
    where: { id: targetAdminId },
    include: { role: true },
  });

  if (!targetAdmin) {
    return { allowed: false, reason: 'Admin user not found.' };
  }

  // Check if target is a Super Admin
  if (targetAdmin.role?.name === 'SUPER_ADMIN') {
    const activeSuperAdmins = await countActiveSuperAdmins();

    if (activeSuperAdmins <= 1) {
      return {
        allowed: false,
        reason: 'Cannot delete the last Super Admin. There must always be at least one active Super Admin.',
      };
    }

    // Requesting admin must also be Super Admin to delete another Super Admin
    const requestingAdmin = await prisma.adminUser.findUnique({
      where: { id: requestingAdminId },
      include: { role: true },
    });

    if (requestingAdmin?.role?.name !== 'SUPER_ADMIN') {
      return {
        allowed: false,
        reason: 'Only Super Admins can delete other Super Admins.',
      };
    }
  }

  return { allowed: true };
}

/**
 * Seed default roles into the database
 */
export async function seedDefaultRoles() {
  for (const [roleName, roleConfig] of Object.entries(DEFAULT_ROLES)) {
    const existingRole = await prisma.adminRole.findUnique({
      where: { name: roleName },
    });

    if (!existingRole) {
      await prisma.adminRole.create({
        data: {
          name: roleName,
          description: roleConfig.description,
          permissions: JSON.stringify(roleConfig.permissions),
          isBuiltIn: true,
        },
      });
      console.log(`Created role: ${roleName}`);
    }
  }
}
