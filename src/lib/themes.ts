import { ChildProfile, saveProfile } from "@/lib/store";

export type ChildTheme = ChildProfile["theme"];

const THEME_ITEMS: Record<ChildTheme, string | null> = {
  default: null,
  rainbow: "theme-rainbow",
  sunshine: "theme-sunshine",
  "night-sky": "theme-night-sky",
  space: "theme-space",
  candy: "theme-candy",
  princess: "theme-princess",
  dinosaur: "theme-dinosaur",
  jungle: "theme-jungle",
  football: "theme-football",
  ocean: "theme-ocean",
  "galaxy-pro": "theme-galaxy-pro",
};

export function getUnlockedThemes(profile: ChildProfile): ChildTheme[] {
  return (Object.keys(THEME_ITEMS) as ChildTheme[]).filter((theme) => {
    const neededItem = THEME_ITEMS[theme];
    return !neededItem || profile.inventory.includes(neededItem);
  });
}

export function applyChildTheme(profile: ChildProfile, theme: ChildTheme): { profile: ChildProfile; ok: boolean; message: string } {
  if (!getUnlockedThemes(profile).includes(theme)) {
    return { profile, ok: false, message: "Theme is still locked." };
  }
  const updated: ChildProfile = { ...profile, theme };
  saveProfile(updated);
  return { profile: updated, ok: true, message: `Theme changed to ${theme}.` };
}
