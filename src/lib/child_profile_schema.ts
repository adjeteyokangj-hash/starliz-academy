import { z } from "zod";

const voiceStyleSchema = z.enum([
  // Current voice styles
  "friendly_coach",
  "cheerful_kid",
  "calm_reader",
  "fun_robot",
  "storyteller",
  "little_helper",
  "superhero_coach",
  "soft_encourager",
  "accent_american",
  "accent_british",
  "accent_irish",
  "accent_south_african",
  "accent_australian",
  "accent_canadian",
  "accent_indian",
  "accent_new_zealand",
  // Legacy voice styles kept for backward compatibility
  "story_narrator",
  "calm_guide",
  "cheerful_buddy",
]);

const mathSkillSchema = z.object({
  score: z.number().min(0).max(1),
  attempts: z.number().int().min(0),
  correct: z.number().int().min(0),
});

const subjectCoachingStylesSchema = z
  .object({
    spelling: z.enum(["patient", "standard", "challenge"]).optional(),
    math: z.enum(["step-by-step", "standard", "problem-solving"]).optional(),
    reading: z.enum(["storytelling", "standard", "comprehension"]).optional(),
  })
  .optional();

const childSettingsSchema = z.object({
  voiceEnabled: z.boolean().optional(),
  sfxEnabled: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
  voiceStyle: voiceStyleSchema.optional(),
  /** @deprecated Use subjectCoachingStyles. Kept for backward compat. */
  coachingStyle: z.enum(["gentle", "balanced", "stretch"]).optional(),
  subjectCoachingStyles: subjectCoachingStylesSchema,
  reduceMotion: z.boolean().optional(),
  largeText: z.boolean().optional(),
  highContrast: z.boolean().optional(),
});

// Validate key identity/safety fields and the newly required learning-memory maps.
// Additional profile fields are allowed and normalized by withChildDefaults.
export const childPayloadSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(64),
    avatar: z.string().trim().min(1),
    ageRange: z.enum(["5-7", "8-10"]),
    ageYears: z.number().int().min(5).max(10),
    startLevelChoice: z.enum(["Beginner", "Intermediate", "Confident"]),
    weaknessMap: z.record(z.string(), z.number().int().min(0)).optional(),
    spellingPatterns: z.record(z.string(), z.number().int().min(0)).optional(),
    mathSkills: z.record(z.string(), mathSkillSchema).optional(),
    settings: childSettingsSchema.optional(),
  })
  .passthrough();
