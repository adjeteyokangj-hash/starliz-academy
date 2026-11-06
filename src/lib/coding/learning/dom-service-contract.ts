import { z } from "zod";

export const inventoryFixtureItemSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,19}$/), title: z.string().min(1).max(120), quantity: z.number().int().min(0).max(1000), revision: z.number().int().min(0).max(1000000) }).strict();
export const domServiceFixtureSchema = z.object({ kind: z.literal("inventory-v1"), items: z.array(inventoryFixtureItemSchema).min(1).max(6).refine(items => new Set(items.map(item => item.id)).size === items.length, "Fixture item IDs must be unique"), role: z.enum(["owner", "viewer"]).default("owner"), failWriteAt: z.array(z.number().int().min(1).max(20)).max(3).default([]), failReadAt: z.array(z.number().int().min(1).max(20)).max(3).default([]) }).strict();
export type DomServiceFixture = z.infer<typeof domServiceFixtureSchema>;
export const inventorySnapshotSchema = z.object({ schema: z.literal("starliz-inventory-v1"), items: domServiceFixtureSchema.shape.items }).strict();
export const domServiceEvidenceSchema = z.object({ kind: z.literal("inventory-v1"), database: z.literal("SQLite"), restored: z.boolean(), before: domServiceFixtureSchema.shape.items, after: domServiceFixtureSchema.shape.items,
  requests: z.array(z.object({ method: z.string().max(10), path: z.string().max(100), status: z.number().int().min(100).max(599) }).strict()).max(40), acceptedWrites: z.number().int().min(0).max(30), databaseReopened: z.literal(true), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), scope: z.string().max(512) }).strict();
