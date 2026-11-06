import { z } from "zod";
export const DEMONSTRATION_MAX_BYTES = 4 * 1024 * 1024;
export const DEMONSTRATION_MAX_SECONDS = 45;
export const demonstrationMetadataSchema = z.object({
  id: z.string().uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().min(128).max(DEMONSTRATION_MAX_BYTES),
  mime: z.literal("video/webm"), transcript: z.string().trim().min(40).max(4000),
  rights: z.string().trim().min(20).max(1000), limitation: z.string().trim().min(20).max(1000),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime(),
  taskHash: z.string().regex(/^[a-f0-9]{64}$/),
  decoded: z.object({ imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), frames: z.number().int().min(2), width: z.number().int().min(16).max(1920), height: z.number().int().min(16).max(1080), durationMs: z.number().min(100).max(46000) }).strict(),
}).strict();
export type DemonstrationMetadata = z.infer<typeof demonstrationMetadataSchema>;
export const demonstrationAttachmentSchema = z.object({ metadata: demonstrationMetadataSchema, receipt: z.string().min(60).max(65536) }).strict();
export type DemonstrationAttachment = z.infer<typeof demonstrationAttachmentSchema>;
