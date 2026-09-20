import { randomUUID } from "crypto";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAddChild } from "@/lib/subscriptions/enforcement";
import {
  allocateUniqueUsername,
  buildChildSyntheticEmail,
  deriveUsernameBaseFromChildName,
  generateChildPassword,
  validateChildAccountPassword,
  validateManualChildUsername,
} from "@/lib/child-account-credentials";

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
};

export type CreateChildAccountResult = CreateChildAccountSuccess | CreateChildAccountFailure;

type CreateChildAccountDeps = {
  canAddChild?: (parentId: string) => Promise<{ allowed: boolean }>;
  usernameTaken?: (username: string) => Promise<boolean>;
  hashPassword?: (password: string) => Promise<string>;
  generatePassword?: () => string;
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
  if (!yearGroup) {
    return {
      ok: false,
      status: 400,
      error: "Year group is required.",
      fieldErrors: { yearGroup: ["Year group is required."] },
    };
  }
  if (!Number.isInteger(profile.ageYears) || profile.ageYears < 3 || profile.ageYears > 18) {
    return {
      ok: false,
      status: 400,
      error: "Age must be between 3 and 18.",
      fieldErrors: { ageYears: ["Age must be between 3 and 18."] },
    };
  }
  return {
    name,
    yearGroup,
    ageYears: profile.ageYears,
    avatar: profile.avatar?.trim() || "⭐",
    dateOfBirth: profile.dateOfBirth?.trim() || undefined,
    keyStageLevel: profile.keyStageLevel?.trim() || undefined,
    selectedSubjects: profile.selectedSubjects,
    learningGoals: profile.learningGoals,
    senSupportNeeds: profile.senSupportNeeds?.trim() || undefined,
    startLevelChoice: profile.startLevelChoice,
  };
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
    const user = await tx.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash: input.passwordHash,
        name: input.profile.name,
        role: "student",
      },
      select: { id: true },
    });

    const parsedDob = input.profile.dateOfBirth ? new Date(input.profile.dateOfBirth) : null;
    const validDob = parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob : null;

    await tx.childProfile.create({
      data: {
        id: input.childId,
        parentId: input.parentId,
        userId: user.id,
        name: input.profile.name,
        age: input.profile.ageYears,
        yearGroup: input.profile.yearGroup,
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

    return { userId: user.id };
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
    const base = deriveUsernameBaseFromChildName(profile.name);
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
      return {
        ok: false,
        status: 409,
        error: "That username is already taken. Please choose another.",
        code: "username_taken",
        fieldErrors: { username: ["That username is already taken."] },
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
  const childId = randomUUID();
  const createInTransaction = deps.createInTransaction ?? defaultCreateInTransaction;

  try {
    const { userId } = await createInTransaction({
      parentId: input.parentId,
      childId,
      username,
      email,
      passwordHash,
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
        username,
        password: plaintextPassword,
        mode: input.mode,
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
