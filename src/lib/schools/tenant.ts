/**
 * Tenant-safe where helpers.
 *
 * Use these to make school filtering explicit and consistent across routes.
 */

export function withSchoolId<T extends Record<string, unknown>>(schoolId: string, where?: T) {
  return {
    schoolId,
    ...(where ?? {}),
  } as T & { schoolId: string };
}

export function withSchoolStudentScope<T extends Record<string, unknown>>(
  schoolId: string,
  where?: T
) {
  return {
    schoolId,
    ...(where ?? {}),
  } as T & { schoolId: string };
}

export function withClassroomScope<T extends Record<string, unknown>>(
  schoolId: string,
  where?: T
) {
  return {
    schoolId,
    ...(where ?? {}),
  } as T & { schoolId: string };
}
