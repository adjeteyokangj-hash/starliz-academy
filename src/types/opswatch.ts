import { z } from "zod";

export const OPSWATCH_DEFAULT_API_URL = "https://opswatch.okanggroup.com/api";

export const opsWatchSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().trim().optional(),
  projectSlug: z.string().trim().optional(),
  environment: z.enum(["production", "staging", "development"]).default("production"),
  apiKey: z.string().trim().optional(),
  signingSecret: z.string().trim().optional(),
});

export type OpsWatchSettingsInput = z.infer<typeof opsWatchSettingsSchema>;
