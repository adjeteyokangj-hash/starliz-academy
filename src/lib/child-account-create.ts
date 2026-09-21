import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAddChild } from "@/lib/subscriptions/enforcement";
import {
  allocateUniqueUsername,
  buildChildSyntheticEmail,
  deriveUsernameBaseFromChildName,
  generateChildPassword,
  suggestAvailableChildUsernames,
  validateChildAccountPassword,
  validateManualChildUsername,
} from "@/lib/child-account-credentials";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { resolveUkStudentYearFields } from "@/lib/uk-student-year";

export type CreateChildAccountMode = "generated" | "manual";

export type CreateChildAccountProfileInput = {
  name: string;
  yearGroup: string;
  ageYears: number;
  avatar?: string;
  dateOfBirth?: string;
  keyStageLevel?: string;
  selectedSubjects?: string[];
  learningGoals?: string[];
  senSupportNeeds?: string;
  startLevelChoice?: "Beginner" | "Intermediate" | "Confident";
};

export type CreateChildAccountInput = {
  parentId: string;
  mode: CreateChildAccountMode;
  profile: CreateChildAccountProfileInput;
  username?: string;
  password?: string;
};

export type CreateChildAccountSuccess = {
  ok: true;
  child: {
    id: string;
    name: string;
    yearGroup: string | null;
    userId: string;
  };
  credentials: {
    username: string;
    password: string;
    mode: CreateChildAccountMode;
  };
};

export type CreateChildAccountFailure = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  suggestions?: string[];
};

export type CreateChildAccountResult = CreateChildAccountSuccess | CreateChildAccountFailure;

export type ResolvedChildLoginCredentials = {
  ok: true;
  mode: CreateChildAccountMode;
  username: string;
  password: string;
  passwordHash: string;
  email: string;
};

export type ResolveChildLoginCredentialsInput = {
  mode: CreateChildAccountMode;
  childName: string;
  username?: string;
  password?: string;
};

type CredentialDeps = {
  usernameTaken?: (username: string) => Promise<boolean>;
  hashPassword?: (password: string) => Promise<string>;
  generatePassword?: () => string;
};

type CreateChildAccountDeps = CredentialDeps & {
  canAddChild?: (parentId: string) => Promise<{ allowed: boolean }>;
  createInTransaction?: (input: {
    parentId: string;
    childId: string;
    username: string;
    email: string;
    passwordHash: string;
    profile: CreateChildAccountProfileInput;
  }) => Promise<{ userId: string }>;
};

function normalizeProfile(profile: CreateChildAccountProfileInput): CreateChildAccountProfileInput | CreateChildAccountFailure {
  const name = profile.name?.trim() ?? "";
  if (!name || name.length > 64) {
    return {
      ok: false,
      status: 400,
      error: "Child name is required.",
      fieldErrors: { name: ["Child name is required."] },
    };
  }
  const yearGroup = profile.yearGroup?.trim() ?? "";
  const derived = resolveUkStudentYearFields({
    dateOfBirth: profile.dateOfBirth,
    currentYearGroup: yearGroup,
    yearGroupLocked: false,
  });
  const resolvedYearGroup = derived.yearGroup ?? yearGroup;
  if (!resolvedYearGroup) {
    return {
      ok: false,
      status: 400,
      error: "Year group is required.",
      fieldErrors: { yearGroup: ["Year group is required. Enter a date of birth to calculate it automatically."] },
    };
  }
  const resolvedAge = derived.ageYears ?? profile.ageYears;
  if (!Number.isInteger(resolvedAge) || resolvedAge < 3 || resolvedAge > 18) {
    return {
      ok: false,
      status: 400,
      error: "Age must be between 3 and 18.",
      fieldErrors: { ageYears: ["Age must be between 3 and 18."] },
    };
  }
  const resolvedKeyStage =
    derived.keyStageLevel
    ?? profile.keyStageLevel?.trim()
    ?? keyStageForYearGroup(resolvedYearGroup);
  return {
    name,
    yearGroup: resolvedYearGroup,
    ageYears: resolvedAge,
    avatar: profile.avatar?.trim() || "⭐",
    dateOfBirth: profile.dateOfBirth?.trim() || undefined,
    keyStageLevel: resolvedKeyStage,
    selectedSubjects: profile.selectedSubjects,
    learningGoals: profile.learningGoals,
    senSupportNeeds: profile.senSupportNeeds?.trim() || undefined,
    startLevelChoice: profile.startLevelChoice,
  };
}

/**
 * Shared credential resolution for Slice 3 portal create and Slice 4 signup.
 * Returns plaintext password only in-memory for the one-time response — never persist it.
 */
export async function resolveChildLoginCredentials(
  input: ResolveChildLoginCredentialsInput,
  deps: CredentialDeps = {},
): Promise<ResolvedChildLoginCredentials | CreateChildAccountFailure> {
  const childName = input.childName?.trim() ?? "";
  if (!childName) {
    return {
      ok: false,
      status: 400,
      error: "Child name is required.",
      fieldErrors: { name: ["Child name is required."] },
    };
  }

  const usernameTaken =
    deps.usernameTaken
    ?? (async (username: string) => {
      const existing = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      return Boolean(existing);
    });

  let username: string;
  let plaintextPassword: string;

  if (input.mode === "generated") {
    const base = deriveUsernameBaseFromChildName(childName);
    username = await allocateUniqueUsername(base, usernameTaken);
    plaintextPassword = (deps.generatePassword ?? generateChildPassword)();
  } else {
    const usernameCheck = validateManualChildUsername(input.username ?? "");
    if (!usernameCheck.ok) {
      return {
        ok: false,
        status: 400,
        error: usernameCheck.error,
        fieldErrors: { username: [usernameCheck.error] },
      };
    }
    if (await usernameTaken(usernameCheck.username)) {
      const suggestions = await suggestAvailableChildUsernames({
        desired: usernameCheck.username,
        childName,
        count: 5,
        isTaken: usernameTaken,
      });
      return {
        ok: false,
        status: 409,
        error: "That username is already taken. Please choose another.",
        code: "username_taken",
        fieldErrors: { username: ["That username is already taken."] },
        suggestions,
      };
    }
    username = usernameCheck.username;

    const passwordCheck = validateChildAccountPassword(input.password ?? "");
    if (!passwordCheck.ok) {
      return {
        ok: false,
        status: 400,
        error: passwordCheck.error,
        fieldErrors: { password: [passwordCheck.error] },
      };
    }
    plaintextPassword = input.password!;
  }

  const passwordCheck = validateChildAccountPassword(plaintextPassword);
  if (!passwordCheck.ok) {
    return {
      ok: false,
      status: 400,
      error: passwordCheck.error,
      fieldErrors: { password: [passwordCheck.error] },
    };
  }

  const hasher = deps.hashPassword ?? hashPassword;
  const passwordHash = await hasher(plaintextPassword);
  const email = buildChildSyntheticEmail(username);

  return {
    ok: true,
    mode: input.mode,
    username,
    password: plaintextPassword,
    passwordHash,
    email,
  };
}

/** Create the student User row inside an existing transaction (signup or portal). */
export async function createStudentUserInTx(
  tx: Prisma.TransactionClient,
  input: {
    username: string;
    email: string;
    passwordHash: string;
    name: string;
  },
): Promise<{ userId: string }> {
  const user = await tx.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash: input.passwordHash,
      name: input.name,
      role: "student",
    },
    select: { id: true },
  });
  return { userId: user.id };
}

async function defaultCreateInTransaction(input: {
  parentId: string;
  childId: string;
  username: string;
  email: string;
  passwordHash: string;
  profile: CreateChildAccountProfileInput;
}): Promise<{ userId: string }> {
  return prisma.$transaction(async (tx) => {
    const { userId } = await createStudentUserInTx(tx, {
      username: input.username,
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.profile.name,
    });

    const parsedDob = input.profile.dateOfBirth ? new Date(input.profile.dateOfBirth) : null;
    const validDob = parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob : null;

    await tx.childProfile.create({
      data: {
        id: input.childId,
        parentId: input.parentId,
        userId,
        name: input.profile.name,
        age: input.profile.ageYears,
        yearGroup: input.profile.yearGroup,
        yearGroupLocked: false,
        avatar: input.profile.avatar ?? "⭐",
        snapshotJson: JSON.stringify({
          onboarding: {
            dateOfBirth: input.profile.dateOfBirth ?? null,
            keyStage: input.profile.keyStageLevel ?? null,
            selectedSubjects: input.profile.selectedSubjects ?? [],
            startLevelChoice: input.profile.startLevelChoice ?? null,
            learningGoals: input.profile.learningGoals ?? [],
            senSupportNeeds: input.profile.senSupportNeeds ?? null,
          },
          dateOfBirth: input.profile.dateOfBirth ?? null,
          keyStageLevel: input.profile.keyStageLevel ?? null,
          yearGroup: input.profile.yearGroup,
          ageYears: input.profile.ageYears,
        }),
      },
    });

    await tx.studentProfile.upsert({
      where: { childId: input.childId },
      create: {
        childId: input.childId,
        dateOfBirth: validDob ?? undefined,
        keyStageLevel: input.profile.keyStageLevel,
        learningLevel: input.profile.startLevelChoice,
        subjectFocus: input.profile.selectedSubjects?.join(", ") ?? undefined,
      },
      update: {
        dateOfBirth: validDob ?? undefined,
        keyStageLevel: input.profile.keyStageLevel,
        learningLevel: input.profile.startLevelChoice,
        subjectFocus: input.profile.selectedSubjects?.join(", ") ?? undefined,
      },
    });

    await tx.user.update({
      where: { id: input.parentId },
      data: { activeChildId: input.childId },
    });

    return { userId };
  });
}

/**
 * Create a student User + linked ChildProfile for an authenticated parent.
 * Returns plaintext credentials only in the success payload — never persisted.
 */
export async function createChildLoginAccount(
  input: CreateChildAccountInput,
  deps: CreateChildAccountDeps = {},
): Promise<CreateChildAccountResult> {
  const profileOrError = normalizeProfile(input.profile);
  if ("ok" in profileOrError && profileOrError.ok === false) {
    return profileOrError;
  }
  const profile = profileOrError as CreateChildAccountProfileInput;

  const canAdd = deps.canAddChild ?? canAddChild;
  const access = await canAdd(input.parentId);
  if (!access.allowed) {
    return {
      ok: false,
      status: 402,
      error: "Subscription upgrade required to add another child.",
      code: "child_limit",
    };
  }

  const resolved = await resolveChildLoginCredentials(
    {
      mode: input.mode,
      childName: profile.name,
      username: input.username,
      password: input.password,
    },
    {
      usernameTaken: deps.usernameTaken,
      hashPassword: deps.hashPassword,
      generatePassword: deps.generatePassword,
    },
  );

  if (!resolved.ok) {
    return resolved;
  }

  const childId = randomUUID();
  const createInTransaction = deps.createInTransaction ?? defaultCreateInTransaction;

  try {
    const { userId } = await createInTransaction({
      parentId: input.parentId,
      childId,
      username: resolved.username,
      email: resolved.email,
      passwordHash: resolved.passwordHash,
      profile,
    });

    return {
      ok: true,
      child: {
        id: childId,
        name: profile.name,
        yearGroup: profile.yearGroup,
        userId,
      },
      credentials: {
        username: resolved.username,
        password: resolved.password,
        mode: resolved.mode,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    if (message.includes("Unique constraint") || message.includes("username")) {
      return {
        ok: false,
        status: 409,
        error: "That username is already taken. Please choose another.",
        code: "username_taken",
      };
    }
    console.error("[child-account-create]", message);
    return {
      ok: false,
      status: 500,
      error: "Could not create child login account. Please try again.",
    };
  }
}

/** Thrown inside a transaction when a concurrent request already linked the child. */
export class ChildLoginLinkConflictError extends Error {
  readonly code = "child_login_exists" as const;

  constructor() {
    super("child_login_exists");
    this.name = "ChildLoginLinkConflictError";
  }
}

export type LinkExistingChildLoginInput = {
  parentId: string;
  childId: string;
  mode: CreateChildAccountMode;
  username?: string;
  password?: string;
};

export type LinkExistingChildLoginSuccess = {
  ok: true;
  child: {
    id: string;
    name: string;
    yearGroup: string | null;
    userId: string;
  };
  credentials: {
    username: string;
    password: string;
    mode: CreateChildAccountMode;
  };
};

export type LinkExistingChildLoginResult = LinkExistingChildLoginSuccess | CreateChildAccountFailure;

export type OwnedChildForLoginLink = {
  id: string;
  name: string;
  yearGroup: string | null;
  userId: string | null;
  hasSchoolLink: boolean;
};

type LinkExistingChildLoginDeps = CredentialDeps & {
  findOwnedChild?: (input: {
    parentId: string;
    childId: string;
  }) => Promise<OwnedChildForLoginLink | null>;
  linkInTransaction?: (input: {
    parentId: string;
    childId: string;
    childName: string;
    username: string;
    email: string;
    passwordHash: string;
  }) => Promise<{ userId: string; childId: string }>;
};

async function defaultFindOwnedChild(input: {
  parentId: string;
  childId: string;
}): Promise<OwnedChildForLoginLink | null> {
  const row = await prisma.childProfile.findFirst({
    where: { id: input.childId, parentId: input.parentId },
    select: {
      id: true,
      name: true,
      yearGroup: true,
      userId: true,
      _count: { select: { schoolLinks: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    yearGroup: row.yearGroup,
    userId: row.userId,
    hasSchoolLink: row._count.schoolLinks > 0,
  };
}

/**
 * Atomic identity link for an existing parent-owned ChildProfile:
 * create student User + set ChildProfile.userId only when still null.
 * Concurrent losers roll back (no orphan User, no userId replacement).
 */
async function defaultLinkInTransaction(input: {
  parentId: string;
  childId: string;
  childName: string;
  username: string;
  email: string;
  passwordHash: string;
}): Promise<{ userId: string; childId: string }> {
  return prisma.$transaction(async (tx) => {
    const { userId } = await createStudentUserInTx(tx, {
      username: input.username,
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.childName,
    });

    const updated = await tx.childProfile.updateMany({
      where: {
        id: input.childId,
        parentId: input.parentId,
        userId: null,
      },
      data: { userId },
    });

    if (updated.count !== 1) {
      // Rolls back the User create in this transaction — no orphan, no replace.
      throw new ChildLoginLinkConflictError();
    }

    return { userId, childId: input.childId };
  });
}

/**
 * Create a student login for an existing unlinked ChildProfile (Slice 6).
 * Does not create a second ChildProfile — only links userId on the existing row.
 */
export async function linkExistingChildLoginAccount(
  input: LinkExistingChildLoginInput,
  deps: LinkExistingChildLoginDeps = {},
): Promise<LinkExistingChildLoginResult> {
  const childId = input.childId?.trim() ?? "";
  if (!childId) {
    return {
      ok: false,
      status: 400,
      error: "Child id is required.",
      code: "child_id_required",
    };
  }

  const findOwnedChild = deps.findOwnedChild ?? defaultFindOwnedChild;
  const child = await findOwnedChild({
    parentId: input.parentId,
    childId,
  });

  if (!child) {
    return {
      ok: false,
      status: 404,
      error: "Child not found.",
      code: "child_not_found",
    };
  }

  if (child.hasSchoolLink) {
    return {
      ok: false,
      status: 403,
      error: "School-managed students cannot use parent Create Login.",
      code: "school_managed_child",
    };
  }

  if (child.userId != null) {
    return {
      ok: false,
      status: 409,
      error: "This child already has a login.",
      code: "child_login_exists",
    };
  }

  const resolved = await resolveChildLoginCredentials(
    {
      mode: input.mode,
      childName: child.name,
      username: input.username,
      password: input.password,
    },
    {
      usernameTaken: deps.usernameTaken,
      hashPassword: deps.hashPassword,
      generatePassword: deps.generatePassword,
    },
  );

  if (!resolved.ok) {
    return resolved;
  }

  const linkInTransaction = deps.linkInTransaction ?? defaultLinkInTransaction;

  try {
    const linked = await linkInTransaction({
      parentId: input.parentId,
      childId: child.id,
      childName: child.name,
      username: resolved.username,
      email: resolved.email,
      passwordHash: resolved.passwordHash,
    });

    return {
      ok: true,
      child: {
        id: child.id,
        name: child.name,
        yearGroup: child.yearGroup,
        userId: linked.userId,
      },
      credentials: {
        username: resolved.username,
        password: resolved.password,
        mode: resolved.mode,
      },
    };
  } catch (error) {
    if (
      error instanceof ChildLoginLinkConflictError
      || (error instanceof Error && error.message === "child_login_exists")
      || (typeof error === "object"
        && error !== null
        && "code" in error
        && (error as { code?: string }).code === "child_login_exists")
    ) {
      return {
        ok: false,
        status: 409,
        error: "This child already has a login.",
        code: "child_login_exists",
      };
    }

    const message = error instanceof Error ? error.message : "unknown_error";
    if (message.includes("Unique constraint") || message.includes("username")) {
      return {
        ok: false,
        status: 409,
        error: "That username is already taken. Please choose another.",
        code: "username_taken",
      };
    }
    console.error("[child-account-link]", message);
    return {
      ok: false,
      status: 500,
      error: "Could not create child login. Please try again.",
    };
  }
}
