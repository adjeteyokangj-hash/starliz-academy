/**
 * Canonical platform vs school access-scope classification.
 *
 * Scope is determined ONLY by AdminUser / SchoolTeacher relationships —
 * never by email, name, or other heuristics.
 */

export type AccessScope = "platform" | "school";

export type SchoolTeacherRoleValue =
  | "owner"
  | "admin"
  | "teacher"
  | "support"
  | "staff_observer"
  | "finance";

/** Display groups for School Users UI (within a school). */
export type SchoolRoleGroupKey =
  | "school_owner"
  | "school_admin"
  | "teachers"
  | "tutors_support"
  | "other";

export const SCHOOL_ROLE_GROUP_ORDER: readonly SchoolRoleGroupKey[] = [
  "school_owner",
  "school_admin",
  "teachers",
  "tutors_support",
  "other",
] as const;

export const SCHOOL_ROLE_GROUP_LABELS: Record<SchoolRoleGroupKey, string> = {
  school_owner: "School Owner",
  school_admin: "School Admin",
  teachers: "Teachers",
  tutors_support: "Tutors/Support",
  other: "Other roles",
};

export const SCHOOL_TEACHER_ROLE_LABELS: Record<SchoolTeacherRoleValue, string> = {
  owner: "School Owner",
  admin: "School Admin",
  teacher: "Teacher",
  support: "Tutor/Support",
  staff_observer: "Staff Observer",
  finance: "Finance",
};

/** Inputs used to classify a user — relationship flags only. */
export type AccessScopeFacts = {
  /** True when the user has an AdminUser row (Operations Console access). */
  hasAdminUser: boolean;
  /** True when the user has one or more SchoolTeacher memberships. */
  hasSchoolTeacherMembership: boolean;
};

/**
 * Returns the scopes a user belongs to based on canonical relationships.
 * A user may appear in both scopes if they have both relationships.
 */
export function classifyAccessScopes(facts: AccessScopeFacts): AccessScope[] {
  const scopes: AccessScope[] = [];
  if (facts.hasAdminUser) scopes.push("platform");
  if (facts.hasSchoolTeacherMembership) scopes.push("school");
  return scopes;
}

export function isPlatformScoped(facts: AccessScopeFacts): boolean {
  return facts.hasAdminUser;
}

export function isSchoolScoped(facts: AccessScopeFacts): boolean {
  return facts.hasSchoolTeacherMembership;
}

export function schoolRoleGroup(role: SchoolTeacherRoleValue | string): SchoolRoleGroupKey {
  switch (role) {
    case "owner":
      return "school_owner";
    case "admin":
      return "school_admin";
    case "teacher":
      return "teachers";
    case "support":
      return "tutors_support";
    default:
      return "other";
  }
}

export function formatSchoolTeacherRole(role: SchoolTeacherRoleValue | string): string {
  if (role in SCHOOL_TEACHER_ROLE_LABELS) {
    return SCHOOL_TEACHER_ROLE_LABELS[role as SchoolTeacherRoleValue];
  }
  return role;
}

/** Staff management path on the platform-admin school dashboard. */
export function schoolStaffManagePath(schoolId: string): string {
  return `/admin/schools/${schoolId}/staff/directory`;
}

export type PlatformUserRowInput = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string | null;
  roleId: string | null;
  active: boolean;
  isLocked?: boolean;
  title?: string | null;
  lastLoginAt?: Date | string | null;
  createdAt?: Date | string;
};

export type SchoolUserRowInput = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  schoolId: string;
  schoolName: string;
  schoolRole: SchoolTeacherRoleValue | string;
  status: string;
  title?: string | null;
  lastActiveAt?: Date | string | null;
  createdAt?: Date | string;
};

export type PlatformUserDto = PlatformUserRowInput & {
  accessScope: "platform";
};

export type SchoolUserDto = SchoolUserRowInput & {
  accessScope: "school";
  schoolRoleLabel: string;
  roleGroup: SchoolRoleGroupKey;
  managePath: string;
};

export function toPlatformUserDto(row: PlatformUserRowInput): PlatformUserDto {
  return {
    ...row,
    accessScope: "platform",
  };
}

export function toSchoolUserDto(row: SchoolUserRowInput): SchoolUserDto {
  return {
    ...row,
    accessScope: "school",
    schoolRoleLabel: formatSchoolTeacherRole(row.schoolRole),
    roleGroup: schoolRoleGroup(row.schoolRole),
    managePath: schoolStaffManagePath(row.schoolId),
  };
}

export type SchoolUsersGrouped = {
  schoolId: string;
  schoolName: string;
  groups: Array<{
    key: SchoolRoleGroupKey;
    label: string;
    users: SchoolUserDto[];
  }>;
};

/**
 * Group school memberships by school name, then by role group.
 * Multi-school users appear once per membership.
 */
export function groupSchoolUsersBySchool(users: SchoolUserDto[]): SchoolUsersGrouped[] {
  const bySchool = new Map<string, { schoolId: string; schoolName: string; users: SchoolUserDto[] }>();

  for (const user of users) {
    const existing = bySchool.get(user.schoolId);
    if (existing) {
      existing.users.push(user);
    } else {
      bySchool.set(user.schoolId, {
        schoolId: user.schoolId,
        schoolName: user.schoolName,
        users: [user],
      });
    }
  }

  const schools = Array.from(bySchool.values()).sort((a, b) =>
    a.schoolName.localeCompare(b.schoolName, undefined, { sensitivity: "base" }),
  );

  return schools.map((school) => {
    const groups = SCHOOL_ROLE_GROUP_ORDER.map((key) => ({
      key,
      label: SCHOOL_ROLE_GROUP_LABELS[key],
      users: school.users
        .filter((u) => u.roleGroup === key)
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, undefined, { sensitivity: "base" })),
    })).filter((g) => g.users.length > 0);

    return {
      schoolId: school.schoolId,
      schoolName: school.schoolName,
      groups,
    };
  });
}

export type AccessScopeSearchHit =
  | { scope: "platform"; label: "Platform"; row: PlatformUserDto }
  | { scope: "school"; label: "School"; row: SchoolUserDto };

/**
 * Search across both scopes. Matching is case-insensitive on name/email/role/school.
 */
export function searchAccessScopeUsers(input: {
  query: string;
  platformUsers: PlatformUserDto[];
  schoolUsers: SchoolUserDto[];
}): AccessScopeSearchHit[] {
  const q = input.query.trim().toLowerCase();
  const hits: AccessScopeSearchHit[] = [];

  for (const row of input.platformUsers) {
    if (!q) {
      hits.push({ scope: "platform", label: "Platform", row });
      continue;
    }
    const hay = [row.name, row.email, row.role, "platform"].filter(Boolean).join(" ").toLowerCase();
    if (hay.includes(q)) hits.push({ scope: "platform", label: "Platform", row });
  }

  for (const row of input.schoolUsers) {
    if (!q) {
      hits.push({ scope: "school", label: "School", row });
      continue;
    }
    const hay = [row.name, row.email, row.schoolName, row.schoolRole, row.schoolRoleLabel, "school"]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) hits.push({ scope: "school", label: "School", row });
  }

  return hits;
}
