export type LevelUnlock = {
  level: number;
  xpNeeded: number;
  unlock: string;
};

export const LEVEL_UNLOCKS: LevelUnlock[] = [
  { level: 1, xpNeeded: 0, unlock: "Starter dashboard, basic spelling, basic maths" },
  { level: 2, xpNeeded: 100, unlock: "Cheerful Kid voice" },
  { level: 3, xpNeeded: 300, unlock: "Pet World unlocked" },
  { level: 4, xpNeeded: 600, unlock: "Hint Tokens unlocked" },
  { level: 5, xpNeeded: 1000, unlock: "Rewards Shop fully unlocked" },
  { level: 6, xpNeeded: 1500, unlock: "Funny Robot voice" },
  { level: 7, xpNeeded: 2100, unlock: "Streak Shield unlocked" },
  { level: 8, xpNeeded: 2800, unlock: "Jungle Theme" },
  { level: 9, xpNeeded: 3600, unlock: "Harder spelling words" },
  { level: 10, xpNeeded: 4500, unlock: "Superhero Coach voice + challenge mode" },
  { level: 11, xpNeeded: 5500, unlock: "Reading Journey level 2" },
  { level: 12, xpNeeded: 6600, unlock: "Ocean Theme + Calm Helper voice" },
  { level: 13, xpNeeded: 7800, unlock: "Maths timed rounds" },
  { level: 14, xpNeeded: 9100, unlock: "Pet upgrades level 2" },
  { level: 15, xpNeeded: 10500, unlock: "Magic Fairy voice" },
  { level: 16, xpNeeded: 12000, unlock: "New avatar items" },
  { level: 17, xpNeeded: 13600, unlock: "Longer reading passages" },
  { level: 18, xpNeeded: 15300, unlock: "Advanced spelling set" },
  { level: 19, xpNeeded: 17100, unlock: "Bonus coin quests" },
  { level: 20, xpNeeded: 19000, unlock: "Big Level 20 badge" },
  { level: 21, xpNeeded: 21000, unlock: "Grammar mini-games" },
  { level: 22, xpNeeded: 23100, unlock: "Maths mixed questions" },
  { level: 23, xpNeeded: 25300, unlock: "Premium pet toys" },
  { level: 24, xpNeeded: 27600, unlock: "New dashboard background" },
  { level: 25, xpNeeded: 30000, unlock: "Halfway Champion badge" },
  { level: 26, xpNeeded: 32500, unlock: "Reading comprehension boost" },
  { level: 27, xpNeeded: 35100, unlock: "Advanced coins rewards" },
  { level: 28, xpNeeded: 37800, unlock: "Custom avatar frame" },
  { level: 29, xpNeeded: 40600, unlock: "More difficult maths" },
  { level: 30, xpNeeded: 43500, unlock: "Level 30 Master badge" },
  { level: 31, xpNeeded: 46500, unlock: "Story challenge mode" },
  { level: 32, xpNeeded: 49600, unlock: "New voice pack" },
  { level: 33, xpNeeded: 52800, unlock: "Pet evolution stage 2" },
  { level: 34, xpNeeded: 56100, unlock: "Advanced spelling challenge" },
  { level: 35, xpNeeded: 59500, unlock: "Golden theme" },
  { level: 36, xpNeeded: 63000, unlock: "Parent milestone report" },
  { level: 37, xpNeeded: 66600, unlock: "Extra daily quest" },
  { level: 38, xpNeeded: 70300, unlock: "Maths boss challenge" },
  { level: 39, xpNeeded: 74100, unlock: "Reading boss challenge" },
  { level: 40, xpNeeded: 78000, unlock: "Level 40 Champion badge" },
  { level: 41, xpNeeded: 82000, unlock: "Expert word sets" },
  { level: 42, xpNeeded: 86100, unlock: "Expert maths sets" },
  { level: 43, xpNeeded: 90300, unlock: "Expert reading sets" },
  { level: 44, xpNeeded: 94600, unlock: "Rare pet item" },
  { level: 45, xpNeeded: 99000, unlock: "Platinum avatar frame" },
  { level: 46, xpNeeded: 103500, unlock: "Super streak bonus" },
  { level: 47, xpNeeded: 108100, unlock: "Final challenge stage 1" },
  { level: 48, xpNeeded: 112800, unlock: "Final challenge stage 2" },
  { level: 49, xpNeeded: 117600, unlock: "Final challenge stage 3" },
  { level: 50, xpNeeded: 122500, unlock: "StarLiz Legend badge" },
];

export function levelFromXp(xp: number): number {
  let level = 1;
  for (const row of LEVEL_UNLOCKS) {
    if (xp >= row.xpNeeded) {
      level = row.level;
    } else {
      break;
    }
  }
  return level;
}

export function xpNeededForLevel(level: number): number {
  const row = LEVEL_UNLOCKS.find((entry) => entry.level === level);
  return row?.xpNeeded ?? LEVEL_UNLOCKS[LEVEL_UNLOCKS.length - 1].xpNeeded;
}

export function nextLevelInfo(xp: number): { currentLevel: number; nextLevel: number | null; currentLevelXpFloor: number; nextLevelXp: number | null } {
  const currentLevel = levelFromXp(xp);
  const currentLevelXpFloor = xpNeededForLevel(currentLevel);
  const nextLevel = currentLevel >= 50 ? null : currentLevel + 1;
  const nextLevelXp = nextLevel ? xpNeededForLevel(nextLevel) : null;
  return { currentLevel, nextLevel, currentLevelXpFloor, nextLevelXp };
}
