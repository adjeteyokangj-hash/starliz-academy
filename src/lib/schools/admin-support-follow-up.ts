/**
 * Admin follow-up state stored in HumanSupportSession.metadataJson.adminFollowUp.
 * Does not alter unresolvedReportJson or tutor sessionNotes.
 */

export type AdminFollowUpStatus = "open" | "in_progress" | "closed";

export type AdminFollowUpState = {
  status: AdminFollowUpStatus;
  ownerUserId: string | null;
  dueAt: string | null;
  adminNote: string | null;
  updatedAt: string;
  updatedByUserId: string;
};

function safeObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export function parseAdminFollowUp(metadataJson: string | null | undefined): AdminFollowUpState | null {
  if (!metadataJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataJson);
  } catch {
    return null;
  }
  const root = safeObject(parsed);
  const row = safeObject(root?.adminFollowUp);
  if (!row) return null;
  const status = row.status;
  if (status !== "open" && status !== "in_progress" && status !== "closed") return null;
  return {
    status,
    ownerUserId: typeof row.ownerUserId === "string" ? row.ownerUserId : null,
    dueAt: typeof row.dueAt === "string" ? row.dueAt : null,
    adminNote: typeof row.adminNote === "string" ? row.adminNote : null,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date(0).toISOString(),
    updatedByUserId: typeof row.updatedByUserId === "string" ? row.updatedByUserId : "",
  };
}

export function mergeAdminFollowUp(
  metadataJson: string | null | undefined,
  patch: {
    status: AdminFollowUpStatus;
    ownerUserId?: string | null;
    dueAt?: string | null;
    adminNote?: string | null;
    updatedByUserId: string;
    now?: Date;
  },
): { metadataJson: string; followUp: AdminFollowUpState } {
  let root: Record<string, unknown> = {};
  if (metadataJson) {
    try {
      const parsed = JSON.parse(metadataJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        root = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      root = {};
    }
  }
  const previous = parseAdminFollowUp(metadataJson);
  const followUp: AdminFollowUpState = {
    status: patch.status,
    ownerUserId: patch.ownerUserId !== undefined ? patch.ownerUserId : (previous?.ownerUserId ?? null),
    dueAt: patch.dueAt !== undefined ? patch.dueAt : (previous?.dueAt ?? null),
    adminNote: patch.adminNote !== undefined
      ? (patch.adminNote ? String(patch.adminNote).slice(0, 4000) : null)
      : (previous?.adminNote ?? null),
    updatedAt: (patch.now ?? new Date()).toISOString(),
    updatedByUserId: patch.updatedByUserId,
  };
  root.adminFollowUp = followUp;
  return { metadataJson: JSON.stringify(root), followUp };
}
