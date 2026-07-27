import { NextResponse } from "next/server";
import type { AdminPermission, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

/**
 * Canonical platform Admin permissions = Prisma AdminPermission enum.
 * Gate 1B aliases map product language and legacy colon strings onto this set.
 * No second vocabulary is stored in the DB.
 */
export const CANONICAL_ADMIN_PERMISSIONS = [
  "MANAGE_USERS",
  "MANAGE_ADMINS",
  "MANAGE_ROLES",
  "VIEW_AUDIT_LOGS",
  "MANAGE_CONTENT",
  "APPROVE_CONTENT",
  "MANAGE_ASSIGNMENTS",
  "VIEW_PROGRESS",
  "MANAGE_BILLING",
  "MANAGE_SUBSCRIPTIONS",
  "MANAGE_INTEGRATIONS",
  "MANAGE_API_KEYS",
  "MANAGE_SETTINGS",
  "MANAGE_BRANDING",
  "MANAGE_SECURITY",
  "VIEW_REPORTS",
  "EXPORT_DATA",
  "ARCHIVE_RECORDS",
  "DELETE_RECORDS",
  "MANAGE_INBOX",
] as const satisfies readonly AdminPermission[];

export type CanonicalAdminPermission = (typeof CANONICAL_ADMIN_PERMISSIONS)[number];

/**
 * Product permissions stored in AdminRole.permissions JSON without a Prisma enum value.
 * Gate 1C: MANAGE_SAFEGUARDING is intentionally NOT aliased to MANAGE_USERS.
 * Super Admin receives it via isSuperAdmin; restricted roles must hold it explicitly.
 */
export const PRODUCT_ADMIN_PERMISSIONS = [
  "MANAGE_SAFEGUARDING",
  "VIEW_POLICIES",
  "MANAGE_POLICIES",
  "APPROVE_POLICIES",
  "PUBLISH_POLICIES",
] as const;
export type ProductAdminPermission = (typeof PRODUCT_ADMIN_PERMISSIONS)[number];
export type EffectiveAdminPermission = CanonicalAdminPermission | ProductAdminPermission;

/** Product-facing aliases → canonical AdminPermission (compatibility layer). */
export const PERMISSION_ALIASES: Record<string, CanonicalAdminPermission | CanonicalAdminPermission[]> = {
  // Gate 1B product language
  VIEW_ADMIN: [], // any active platform admin (handled separately)
  MANAGE_SCHOOLS: "MANAGE_USERS",
  MANAGE_PARENTS: "MANAGE_USERS",
  MANAGE_STUDENTS: "MANAGE_USERS",
  MANAGE_TEACHERS: "MANAGE_USERS",
  MANAGE_TUTORS: "MANAGE_USERS",
  MANAGE_SUPPORT: "MANAGE_INBOX",
  // MANAGE_POLICIES is a product permission (Gate 5) — not aliased to MANAGE_SETTINGS.

  // Legacy colon vocabulary used across Admin APIs
  "content:view": "MANAGE_CONTENT",
  "content:edit": "MANAGE_CONTENT",
  "content:delete": "DELETE_RECORDS",
  "content:approve": "APPROVE_CONTENT",
  "parents:write": "MANAGE_USERS",
  "parents:view": "MANAGE_USERS",
  "students:write": "MANAGE_USERS",
  "students:view": "MANAGE_USERS",
  "reports:view": "VIEW_REPORTS",
  "ai:run": "MANAGE_CONTENT",
  "jobs:run": "MANAGE_SETTINGS",
  "settings:view": "MANAGE_SETTINGS",
  "settings:api_keys:test": "MANAGE_API_KEYS",
};

export type AdminAuthContext = {
  userId: string;
  email: string;
  adminUserId: string;
  roleId: string | null;
  roleName: string | null;
  permissions: EffectiveAdminPermission[];
  isSuperAdmin: boolean;
  active: boolean;
  isLocked: boolean;
};

function normalizeRoleName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function parsePermissionList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Expand a requested permission key into effective permission(s) that satisfy it. */
export function expandPermissionRequirement(permission: string): EffectiveAdminPermission[] {
  const key = permission.trim();
  if (!key) return [];

  if ((CANONICAL_ADMIN_PERMISSIONS as readonly string[]).includes(key)) {
    return [key as CanonicalAdminPermission];
  }
  if ((PRODUCT_ADMIN_PERMISSIONS as readonly string[]).includes(key)) {
    return [key as ProductAdminPermission];
  }

  const alias = PERMISSION_ALIASES[key] ?? PERMISSION_ALIASES[key.toUpperCase()];
  if (!alias) return [];
  return Array.isArray(alias) ? alias : [alias];
}

/** Map a stored permission string (legacy, product, or canonical) into effective tokens. */
export function normalizeStoredPermission(permission: string): EffectiveAdminPermission[] {
  const key = permission.trim();
  if ((CANONICAL_ADMIN_PERMISSIONS as readonly string[]).includes(key)) {
    return [key as CanonicalAdminPermission];
  }
  if ((PRODUCT_ADMIN_PERMISSIONS as readonly string[]).includes(key)) {
    return [key as ProductAdminPermission];
  }
  return expandPermissionRequirement(key);
}

export function normalizePermissionSet(rawPermissions: string[]): EffectiveAdminPermission[] {
  const set = new Set<EffectiveAdminPermission>();
  for (const entry of rawPermissions) {
    for (const mapped of normalizeStoredPermission(entry)) {
      set.add(mapped);
    }
  }
  return [...set];
}

export async function loadAdminAuthContext(userId: string): Promise<AdminAuthContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      adminProfile: {
        select: {
          id: true,
          active: true,
          isLocked: true,
          roleId: true,
          role: { select: { id: true, name: true, permissions: true } },
        },
      },
    },
  });

  if (!user || user.role !== "admin" || !user.adminProfile) {
    return null;
  }

  const roleName = normalizeRoleName(user.adminProfile.role?.name);
  const isSuperAdmin = roleName === "SUPER_ADMIN";
  const permissions = isSuperAdmin
    ? [...CANONICAL_ADMIN_PERMISSIONS, ...PRODUCT_ADMIN_PERMISSIONS]
    : normalizePermissionSet(parsePermissionList(user.adminProfile.role?.permissions));

  return {
    userId: user.id,
    email: user.email,
    adminUserId: user.adminProfile.id,
    roleId: user.adminProfile.roleId,
    roleName: user.adminProfile.role?.name ?? null,
    permissions,
    isSuperAdmin,
    active: user.adminProfile.active,
    isLocked: user.adminProfile.isLocked,
  };
}

export function contextHasPermission(
  context: AdminAuthContext,
  permission: string,
): boolean {
  if (!context.active || context.isLocked) return false;
  if (context.isSuperAdmin) return true;
  if (!context.roleId || !context.roleName) return false;

  const key = permission.trim();
  // Any active platform Admin with a valid role may enter the Admin surface.
  if (key === "VIEW_ADMIN" || key.toUpperCase() === "VIEW_ADMIN") {
    return true;
  }

  const required = expandPermissionRequirement(key);
  if (required.length === 0) {
    // Unknown permission keys fail closed.
    return false;
  }
  return required.every((item) => context.permissions.includes(item as EffectiveAdminPermission));
}

export async function auditAdminAccessDenial(input: {
  actorUserId: string;
  action: string;
  reason: string;
  targetUserId?: string | null;
  permission?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: "admin_auth",
    entityId: input.targetUserId ?? input.actorUserId,
    metadata: {
      reason: input.reason,
      permission: input.permission ?? null,
      ...(input.metadata ?? {}),
    },
  });
}

export function deniedAdminResponse(message = "You do not have permission to perform this action.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Serializes every mutation that could remove active Super Admin access.
 * The transaction-scoped advisory lock prevents two concurrent requests from
 * both observing another active Super Admin and then removing both accounts.
 */
export async function mutateAdminWithLastSuperAdminProtection<T>(input: {
  actorUserId: string;
  targetAdminUserId: string;
  nextActive?: boolean;
  nextLocked?: boolean;
  nextRoleId?: string | null;
  mutate: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ locked: number }>>`
      SELECT 1 AS locked
      FROM pg_advisory_xact_lock(hashtext('starliz:last-super-admin'))
    `;

    const target = await tx.adminUser.findUnique({
      where: { id: input.targetAdminUserId },
      include: { role: true },
    });
    if (!target) {
      return { ok: false as const, reason: "Admin user not found." };
    }

    const currentlySuper = normalizeRoleName(target.role?.name) === "SUPER_ADMIN";
    if (currentlySuper) {
      const superAdminRole = await tx.adminRole.findUnique({
        where: { name: "SUPER_ADMIN" },
        select: { id: true },
      });
      const remaining = superAdminRole
        ? await tx.adminUser.count({
            where: {
              roleId: superAdminRole.id,
              active: true,
              isLocked: false,
              id: { not: target.id },
            },
          })
        : 0;

      const willRemainActive =
        (input.nextActive ?? target.active) === true
        && (input.nextLocked ?? target.isLocked) === false;
      let willRemainSuper = true;
      if (input.nextRoleId !== undefined) {
        const nextRole = input.nextRoleId
          ? await tx.adminRole.findUnique({
              where: { id: input.nextRoleId },
              select: { name: true },
            })
          : null;
        willRemainSuper = normalizeRoleName(nextRole?.name) === "SUPER_ADMIN";
      }

      if (remaining <= 0 && (!willRemainActive || !willRemainSuper)) {
        return {
          ok: false as const,
          reason: "Cannot disable, lock, demote or delete the last active Super Admin.",
          targetUserId: target.userId,
        };
      }
    }

    return { ok: true as const, value: await input.mutate(tx) };
  });

  if (!result.ok) {
    await auditAdminAccessDenial({
      actorUserId: input.actorUserId,
      action: "admin_last_super_admin_protected",
      reason: "last_super_admin_protected",
      targetUserId: "targetUserId" in result ? result.targetUserId : undefined,
      metadata: {
        targetAdminUserId: input.targetAdminUserId,
        nextActive: input.nextActive ?? null,
        nextLocked: input.nextLocked ?? null,
        nextRoleId: input.nextRoleId ?? null,
      },
    });
  }

  return result;
}

export function isKnownPermissionToken(permission: string): boolean {
  if ((CANONICAL_ADMIN_PERMISSIONS as readonly string[]).includes(permission)) return true;
  if ((PRODUCT_ADMIN_PERMISSIONS as readonly string[]).includes(permission)) return true;
  return permission in PERMISSION_ALIASES || permission.toUpperCase() in PERMISSION_ALIASES;
}

export function validateRolePermissionList(raw: unknown): {
  ok: true;
  permissions: EffectiveAdminPermission[];
} | {
  ok: false;
  error: string;
} {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Permissions must be an array." };
  }
  const unknown = raw.map(String).filter((item) => !isKnownPermissionToken(item));
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown permission(s): ${unknown.join(", ")}` };
  }
  return { ok: true, permissions: normalizePermissionSet(raw.map(String)) };
}
