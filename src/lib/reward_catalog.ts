export type RewardCatalogItem = {
  id: string;
  name: string;
  cost: number;
  unlockLevel: number;
  category: "themes" | "avatars" | "voices" | "pet" | "boosts";
  description?: string;
};

export type RewardCatalogSection = {
  title: string;
  items: RewardCatalogItem[];
};

export const REWARD_CATALOG: RewardCatalogSection[] = [
  {
    title: "Themes 🎨",
    items: [
      { id: "theme-rainbow", name: "Rainbow Theme", cost: 20, unlockLevel: 1, category: "themes" },
      { id: "theme-sunshine", name: "Sunshine Theme", cost: 25, unlockLevel: 1, category: "themes" },
      { id: "theme-night-sky", name: "Night Sky Theme", cost: 35, unlockLevel: 2, category: "themes" },
      { id: "theme-space", name: "Space Theme", cost: 40, unlockLevel: 3, category: "themes" },
      { id: "theme-candy", name: "Candy Theme", cost: 45, unlockLevel: 4, category: "themes" },
      { id: "theme-princess", name: "Princess Theme", cost: 50, unlockLevel: 5, category: "themes" },
      { id: "theme-dinosaur", name: "Dinosaur Theme", cost: 55, unlockLevel: 6, category: "themes" },
      { id: "theme-jungle", name: "Jungle Theme", cost: 60, unlockLevel: 8, category: "themes" },
      { id: "theme-football", name: "Football Theme", cost: 65, unlockLevel: 9, category: "themes" },
      { id: "theme-ocean", name: "Ocean Theme", cost: 80, unlockLevel: 12, category: "themes" },
      { id: "theme-galaxy-pro", name: "Galaxy Pro Theme", cost: 120, unlockLevel: 16, category: "themes" },
    ],
  },
  {
    title: "Avatars & Outfits 👕",
    items: [
      { id: "avatar-unicorn", name: "Unicorn Avatar", cost: 25, unlockLevel: 1, category: "avatars" },
      { id: "avatar-star-student", name: "Star Student Avatar", cost: 25, unlockLevel: 1, category: "avatars" },
      { id: "avatar-robot", name: "Robot Avatar", cost: 35, unlockLevel: 3, category: "avatars" },
      { id: "avatar-astronaut", name: "Astronaut Avatar", cost: 40, unlockLevel: 4, category: "avatars" },
      { id: "outfit-superhero-cape", name: "Superhero Cape", cost: 45, unlockLevel: 5, category: "avatars" },
      { id: "avatar-dragon", name: "Dragon Avatar", cost: 55, unlockLevel: 7, category: "avatars" },
      { id: "outfit-crown", name: "Crown", cost: 60, unlockLevel: 8, category: "avatars" },
      { id: "outfit-wizard-hat", name: "Wizard Hat", cost: 75, unlockLevel: 10, category: "avatars" },
      { id: "avatar-book-hero", name: "Book Hero Avatar", cost: 90, unlockLevel: 13, category: "avatars" },
    ],
  },
  {
    title: "Voice Packs 🎙️",
    items: [
      { id: "voice-friendly-coach", name: "Friendly Coach", cost: 0, unlockLevel: 1, category: "voices" },
      { id: "voice-cheerful-kid", name: "Cheerful Kid", cost: 30, unlockLevel: 2, category: "voices" },
      { id: "voice-story-reader", name: "Story Reader", cost: 40, unlockLevel: 4, category: "voices" },
      { id: "voice-gentle-reader", name: "Gentle Reader", cost: 45, unlockLevel: 5, category: "voices" },
      { id: "voice-funny-robot", name: "Funny Robot", cost: 50, unlockLevel: 6, category: "voices" },
      { id: "voice-adventure-guide", name: "Adventure Guide", cost: 65, unlockLevel: 8, category: "voices" },
      { id: "voice-superhero-coach", name: "Superhero Coach", cost: 70, unlockLevel: 10, category: "voices" },
      { id: "voice-calm-helper", name: "Calm Helper", cost: 80, unlockLevel: 12, category: "voices" },
      { id: "voice-magic-fairy", name: "Magic Fairy", cost: 100, unlockLevel: 15, category: "voices" },
      { id: "voice-premium-storyteller", name: "Premium Storyteller", cost: 130, unlockLevel: 18, category: "voices" },
      { id: "voice-accent-american", name: "American Accent", cost: 145, unlockLevel: 19, category: "voices", description: "US English coach voice pack" },
      { id: "voice-accent-british", name: "British Accent", cost: 150, unlockLevel: 20, category: "voices", description: "British English storyteller voice pack" },
      { id: "voice-accent-irish", name: "Irish Accent", cost: 155, unlockLevel: 21, category: "voices", description: "Irish English gentle mentor pack" },
      { id: "voice-accent-south-african", name: "South African Accent", cost: 160, unlockLevel: 22, category: "voices", description: "South African English explorer voice pack" },
      { id: "voice-accent-australian", name: "Australian Accent", cost: 165, unlockLevel: 23, category: "voices", description: "Australian English upbeat pack" },
      { id: "voice-accent-canadian", name: "Canadian Accent", cost: 170, unlockLevel: 24, category: "voices", description: "Canadian English learning coach pack" },
      { id: "voice-accent-indian", name: "Indian English Accent", cost: 175, unlockLevel: 25, category: "voices", description: "Indian English clear guide pack" },
      { id: "voice-accent-new-zealand", name: "New Zealand Accent", cost: 180, unlockLevel: 26, category: "voices", description: "New Zealand English helper pack" },
    ],
  },
  {
    title: "Pet World 🐾",
    items: [
      { id: "pet-food", name: "Pet Food", cost: 10, unlockLevel: 1, category: "pet" },
      { id: "pet-treats", name: "Pet Treats", cost: 15, unlockLevel: 1, category: "pet" },
      { id: "pet-ball", name: "Pet Ball", cost: 20, unlockLevel: 2, category: "pet" },
      { id: "pet-brush", name: "Pet Brush", cost: 25, unlockLevel: 3, category: "pet" },
      { id: "pet-bed", name: "Pet Bed", cost: 35, unlockLevel: 4, category: "pet" },
      { id: "pet-hat", name: "Pet Hat", cost: 50, unlockLevel: 6, category: "pet" },
      { id: "pet-sparkle-collar", name: "Sparkle Collar", cost: 65, unlockLevel: 8, category: "pet" },
      { id: "pet-house", name: "Pet House", cost: 90, unlockLevel: 10, category: "pet" },
      { id: "pet-playground", name: "Pet Playground", cost: 140, unlockLevel: 15, category: "pet" },
    ],
  },
  {
    title: "Learning Boosts ⚡",
    items: [
      { id: "boost-double-xp-10m", name: "Double XP for 10 minutes", cost: 50, unlockLevel: 5, category: "boosts" },
      { id: "boost-streak-shield", name: "Streak Shield", cost: 60, unlockLevel: 7, category: "boosts" },
      { id: "boost-hint-token-x3", name: "Hint Token x3", cost: 40, unlockLevel: 4, category: "boosts" },
      { id: "boost-bonus-coin-round", name: "Bonus Coin Round", cost: 70, unlockLevel: 10, category: "boosts" },
      { id: "boost-focus-mode", name: "Focus Mode Boost", cost: 85, unlockLevel: 11, category: "boosts" },
      { id: "boost-revision-pass", name: "Revision Pass", cost: 95, unlockLevel: 13, category: "boosts" },
      { id: "boost-weekend-bonus", name: "Weekend Bonus", cost: 110, unlockLevel: 14, category: "boosts" },
    ],
  },
];

export const FLAT_REWARD_CATALOG: RewardCatalogItem[] = REWARD_CATALOG.flatMap((section) => section.items);

export function findRewardCatalogItem(itemId: string): RewardCatalogItem | null {
  return FLAT_REWARD_CATALOG.find((item) => item.id === itemId) ?? null;
}

export function getNextUnlockLevel(currentLevel: number): number {
  const levels = REWARD_CATALOG.flatMap((section) => section.items.map((item) => item.unlockLevel)).sort((a, b) => a - b);
  return levels.find((level) => level > currentLevel) ?? currentLevel;
}
