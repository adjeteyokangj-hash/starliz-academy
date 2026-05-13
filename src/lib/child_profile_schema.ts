import { z } from "zod";

const yearGroupAgeBands: Record<string, { min: number; max: number }> = {
  reception: { min: 4, max: 5 },
  "year 1": { min: 5, max: 6 },
  "year 2": { min: 6, max: 7 },
  "year 3": { min: 7, max: 8 },
  "year 4": { min: 8, max: 9 },
  "year 5": { min: 9, max: 10 },
  "year 6": { min: 10, max: 11 },
  "year 7": { min: 11, max: 12 },
  "year 8": { min: 12, max: 13 },
  "year 9": { min: 13, max: 14 },
  "year 10": { min: 14, max: 15 },
  "year 11": { min: 15, max: 16 },
};

function calcAgeFromDob(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

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
    ageRange: z.enum(["5-7", "8-10"]).optional(),
    ageYears: z.number().int().min(3).max(18),
    startLevelChoice: z.enum(["Beginner", "Intermediate", "Confident"]).optional(),
    yearGroup: z.string().trim().min(1).max(40),
    schoolYear: z.string().trim().min(1).max(40).optional(),
    dateOfBirth: z.string().date().optional(),
    keyStageLevel: z.string().trim().min(1).max(40).optional(),
    subjectLevel: z.string().trim().min(1).max(40).optional(),
    learningGoals: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    senSupportNeeds: z.string().trim().max(500).optional(),
    weaknessMap: z.record(z.string(), z.number().int().min(0)).optional(),
    spellingPatterns: z.record(z.string(), z.number().int().min(0)).optional(),
    mathSkills: z.record(z.string(), mathSkillSchema).optional(),
    settings: childSettingsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const band = yearGroupAgeBands[value.yearGroup.trim().toLowerCase()];
    if (band) {
      const ageWithinBand = value.ageYears >= band.min && value.ageYears <= band.max + 1;
      if (!ageWithinBand) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ageYears"],
          message: `Age ${value.ageYears} does not match ${value.yearGroup} expectations (${band.min}-${band.max + 1}).`,
        });
      }
    }

    if (value.dateOfBirth) {
      const derivedAge = calcAgeFromDob(value.dateOfBirth);
      if (Math.abs(derivedAge - value.ageYears) > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateOfBirth"],
          message: "Date of birth does not align with the entered age.",
        });
      }
    }
  })
  .passthrough();
