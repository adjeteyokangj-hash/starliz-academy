import type { ChildProfile } from "@prisma/client";

export type ChildPinState = {
  pinEnabled: boolean;
  pinHash: string | null;
  updatedAt: string | null;
};

type ChildSecurityDocument = {
  security?: {
    childPin?: {
      enabled?: boolean;
      hash?: string | null;
      updatedAt?: string | null;
    };
  };
};

export function readChildPinState(coachingMemoryJson: string | null | undefined): ChildPinState {
  if (!coachingMemoryJson) {
    return { pinEnabled: false, pinHash: null, updatedAt: null };
  }

  try {
    const parsed = JSON.parse(coachingMemoryJson) as ChildSecurityDocument;
    const childPin = parsed.security?.childPin;
    return {
      pinEnabled: Boolean(childPin?.enabled && childPin?.hash),
      pinHash: typeof childPin?.hash === "string" ? childPin.hash : null,
      updatedAt: typeof childPin?.updatedAt === "string" ? childPin.updatedAt : null,
    };
  } catch {
    return { pinEnabled: false, pinHash: null, updatedAt: null };
  }
}

export function writeChildPinState(
  coachingMemoryJson: string | null | undefined,
  update: { pinEnabled: boolean; pinHash: string | null; updatedAt: string | null },
): string {
  let parsed: ChildSecurityDocument = {};

  if (coachingMemoryJson) {
    try {
      parsed = JSON.parse(coachingMemoryJson) as ChildSecurityDocument;
    } catch {
      parsed = {};
    }
  }

  const next: ChildSecurityDocument = {
    ...parsed,
    security: {
      ...(parsed.security ?? {}),
      childPin: {
        enabled: update.pinEnabled,
        hash: update.pinHash,
        updatedAt: update.updatedAt,
      },
    },
  };

  return JSON.stringify(next);
}

export function childPinView(profile: Pick<ChildProfile, "id" | "name" | "yearGroup" | "coachingMemoryJson">) {
  const pinState = readChildPinState(profile.coachingMemoryJson);
  return {
    id: profile.id,
    name: profile.name,
    yearGroup: profile.yearGroup,
    pinEnabled: pinState.pinEnabled,
  };
}
