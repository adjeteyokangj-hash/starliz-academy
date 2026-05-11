import { ChildProfile, saveProfile } from "@/lib/store";

export type HubKey = "spelling" | "math" | "reading" | "pet" | "rewards" | "profiles";
export type HubMoveDirection = "left" | "right" | "up" | "down";
export const HUB_KEYS: HubKey[] = ["spelling", "math", "reading", "pet", "rewards", "profiles"];

export function getHubOrder(profile: ChildProfile): HubKey[] {
  const existing = (profile.hubOrder ?? []).filter((value): value is HubKey => HUB_KEYS.includes(value as HubKey));
  return [...new Set([...existing, ...HUB_KEYS])];
}

export function toggleHubPin(profile: ChildProfile, hubKey: HubKey): ChildProfile {
  const exists = profile.hubPins.includes(hubKey);
  const hubPins = exists
    ? profile.hubPins.filter((key) => key !== hubKey)
    : [...profile.hubPins, hubKey];

  const updated: ChildProfile = {
    ...profile,
    hubPins,
  };
  saveProfile(updated);
  return updated;
}

export function reorderHubCards(profile: ChildProfile, draggedKey: HubKey, targetKey: HubKey): ChildProfile {
  const ordered = [...getHubOrder(profile)];
  const fromIndex = ordered.indexOf(draggedKey);
  const toIndex = ordered.indexOf(targetKey);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return profile;

  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);

  const updated: ChildProfile = {
    ...profile,
    hubOrder: ordered,
  };
  saveProfile(updated);
  return updated;
}

export function canMoveHubCard(profile: ChildProfile, hubKey: HubKey, direction: HubMoveDirection, columns: number): boolean {
  const ordered = getHubOrder(profile);
  const index = ordered.indexOf(hubKey);
  if (index < 0) return false;
  const safeColumns = Math.max(1, columns);

  if (direction === "left") return safeColumns > 1 && index % safeColumns !== 0;
  if (direction === "right") return safeColumns > 1 && index % safeColumns !== safeColumns - 1 && index < ordered.length - 1;
  if (direction === "up") return index - safeColumns >= 0;
  return index + safeColumns < ordered.length;
}

export function moveHubCard(profile: ChildProfile, hubKey: HubKey, direction: HubMoveDirection, columns: number): ChildProfile {
  const ordered = [...getHubOrder(profile)];
  const index = ordered.indexOf(hubKey);
  if (index < 0) return profile;
  const safeColumns = Math.max(1, columns);

  if (!canMoveHubCard(profile, hubKey, direction, safeColumns)) return profile;

  const targetIndex =
    direction === "left"
      ? index - 1
      : direction === "right"
        ? index + 1
        : direction === "up"
          ? index - safeColumns
          : index + safeColumns;

  const [moved] = ordered.splice(index, 1);
  ordered.splice(targetIndex, 0, moved);

  const updated: ChildProfile = {
    ...profile,
    hubOrder: ordered,
  };
  saveProfile(updated);
  return updated;
}

export function resetHubOrder(profile: ChildProfile): ChildProfile {
  const updated: ChildProfile = {
    ...profile,
    hubOrder: [...HUB_KEYS],
  };
  saveProfile(updated);
  return updated;
}
