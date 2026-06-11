export type ContentMetadata = Record<string, unknown>;

export type BlackBoxGateTargetStatus = "reviewed" | "approved" | "published";

export type BlackBoxGateFailure = {
  error: string;
  code: "black_box_gate_required";
  required: {
    blackBoxLiveTest: "passed";
    blackBoxAdminVerification: "verified";
  };
};

function isRecord(value: unknown): value is ContentMetadata {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function statusFrom(value: unknown): string {
  if (!isRecord(value)) return "";
  const status = value.status;
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

export function parseContentMetadataJson(raw: unknown): ContentMetadata {
  if (isRecord(raw)) return raw;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function isBlackBoxGateTargetStatus(status: unknown): status is BlackBoxGateTargetStatus {
  return status === "reviewed" || status === "approved" || status === "published";
}

export function hasPassedBlackBoxGate(metadata: unknown): boolean {
  const parsed = parseContentMetadataJson(metadata);
  return (
    statusFrom(parsed.blackBoxLiveTest) === "passed" &&
    statusFrom(parsed.blackBoxAdminVerification) === "verified"
  );
}

export function buildBlackBoxGateFailure(): BlackBoxGateFailure {
  return {
    error: "Black box live testing and admin verification are required before this content can be reviewed, approved, or published.",
    code: "black_box_gate_required",
    required: {
      blackBoxLiveTest: "passed",
      blackBoxAdminVerification: "verified",
    },
  };
}

export function mergeBlackBoxGateMetadata(existingMetadata: unknown, patch: ContentMetadata): ContentMetadata {
  return {
    ...parseContentMetadataJson(existingMetadata),
    ...patch,
  };
}

export type BlackBoxGateSaveRequestedStatus =
  | "generated"
  | "review"
  | "reviewed"
  | "approved"
  | "published"
  | "rejected";

export function resolveBlackBoxGatedSaveStatus(status: BlackBoxGateSaveRequestedStatus): Exclude<BlackBoxGateSaveRequestedStatus, "review"> {
  const requestedStatus = status === "review" ? "reviewed" : status;
  return isBlackBoxGateTargetStatus(requestedStatus) ? "generated" : requestedStatus;
}
