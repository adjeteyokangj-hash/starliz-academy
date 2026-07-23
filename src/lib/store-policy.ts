export type StoreApprovalMode = "none" | "parent" | "admin";
export type StoreRewardType = "digital" | "physical";

export type StorePolicy = {
  rewardType: StoreRewardType;
  approvalMode: StoreApprovalMode;
  stockTotal: number | null;
};

const TYPE_RE = /type\s*:\s*(digital|physical)/i;
const APPROVAL_RE = /approval\s*:\s*(none|parent|admin)/i;
const STOCK_RE = /stock\s*:\s*(\d+)/i;

/** Parse legacy policy tokens embedded in store item descriptions. */
export function parseStorePolicyFromDescription(description: string | null | undefined): StorePolicy {
  const text = description ?? "";
  const typeMatch = text.match(TYPE_RE);
  const approvalMatch = text.match(APPROVAL_RE);
  const stockMatch = text.match(STOCK_RE);

  return {
    rewardType: (typeMatch?.[1]?.toLowerCase() as StoreRewardType | undefined) ?? "digital",
    approvalMode: (approvalMatch?.[1]?.toLowerCase() as StoreApprovalMode | undefined) ?? "none",
    stockTotal: stockMatch ? Math.max(0, Number(stockMatch[1])) : null,
  };
}

export function stripStorePolicyTokensFromDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const cleaned = description
    .replace(TYPE_RE, "")
    .replace(APPROVAL_RE, "")
    .replace(STOCK_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || null;
}

/**
 * Prefer explicit StoreItem columns; fall back to description tokens for unmigrated rows.
 */
export function resolveStorePolicy(input: {
  rewardType?: string | null;
  approvalMode?: string | null;
  stockTotal?: number | null;
  description?: string | null;
}): StorePolicy {
  const fromDescription = parseStorePolicyFromDescription(input.description);
  const rewardType = input.rewardType === "physical" || input.rewardType === "digital"
    ? input.rewardType
    : fromDescription.rewardType;
  const approvalMode = input.approvalMode === "none" || input.approvalMode === "parent" || input.approvalMode === "admin"
    ? input.approvalMode
    : fromDescription.approvalMode;

  // Explicit null stockTotal means unlimited. Undefined falls back to description.
  const stockTotal = input.stockTotal === undefined
    ? fromDescription.stockTotal
    : input.stockTotal === null
      ? null
      : Math.max(0, Math.floor(input.stockTotal));

  return { rewardType, approvalMode, stockTotal };
}

export function isCatalogStoreItemId(id: string, catalogIds: Set<string>): boolean {
  return catalogIds.has(id);
}
