import { z } from "zod";

const optionalText = z.string().trim().optional().nullable();

export const adminResourceSchemas = {
  lessons: z.object({
    title: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    ageGroup: optionalText,
    difficulty: z.number().int().min(1).max(10).default(1),
    status: z.string().trim().default("draft"),
    contentRefs: optionalText,
  }),
  rewards: z.object({
    name: z.string().trim().min(1),
    trigger: z.string().trim().min(1),
    points: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  }),
  store: z.object({
    name: z.string().trim().min(1),
    category: z.string().trim().min(1),
    description: optionalText,
    price: z.number().int().min(0).default(0),
    minAge: z.number().int().min(5).max(18).optional().nullable(),
    maxAge: z.number().int().min(5).max(18).optional().nullable(),
    requiredLevel: z.number().int().min(1).max(20).optional().nullable(),
    isActive: z.boolean().default(true),
  }),
  support: z.object({
    parentId: optionalText,
    subject: z.string().trim().min(1),
    message: optionalText,
    status: z.string().trim().default("open"),
    priority: z.string().trim().default("normal"),
  }),
  notifications: z.object({
    name: z.string().trim().min(1),
    channel: z.string().trim().min(1),
    subject: optionalText,
    body: z.string().trim().min(1),
    isActive: z.boolean().default(true),
  }),
  "voice-media": z.object({
    title: z.string().trim().min(1),
    type: z.string().trim().min(1),
    url: optionalText,
    status: z.string().trim().default("draft"),
  }),
} as const;

export const adminResourceDelegates: Record<keyof typeof adminResourceSchemas, string> = {
  lessons: "lesson",
  rewards: "rewardRule",
  store: "storeItem",
  support: "supportTicket",
  notifications: "notificationTemplate",
  "voice-media": "mediaAsset",
};

export const adminResourceSearchFields: Record<keyof typeof adminResourceSchemas, string[]> = {
  lessons: ["title", "subject"],
  rewards: ["name", "trigger"],
  store: ["name", "category"],
  support: ["subject", "message"],
  notifications: ["name", "subject", "body"],
  "voice-media": ["title", "type"],
};

export type AdminResourceKey = keyof typeof adminResourceSchemas;

export function isAdminResource(value: string): value is AdminResourceKey {
  return value in adminResourceSchemas;
}
