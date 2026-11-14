import { z } from "zod";
import { ACTIVITY_VERSION } from "./types";
export const bridgeContextSchema = z.object({ planId: z.enum(["block-coding", "blocks-to-text", "programming-web", "applied"]), planHash: z.string().regex(/^[a-f0-9]{64}$/), entryYear: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]) }).strict().refine(value => ({ "block-coding": 3, "blocks-to-text": 5, "programming-web": 7, applied: 10 })[value.planId] === value.entryYear, "Keep the approved pathway and entry year together.");
export function matchesBridgeWorkspace(lessonId: string, activityId: string, value: unknown) {
  const parsed = bridgeContextSchema.safeParse(value);
  return parsed.success && lessonId === `bridge:${ACTIVITY_VERSION}:${parsed.data.planId}:${parsed.data.planHash}:${activityId}`;
}
export function bridgeActivityId(lessonId: string) {
  const prefix = `bridge:${ACTIVITY_VERSION}:`; if (!lessonId.startsWith(prefix)) return null;
  const parts = lessonId.slice(prefix.length).split(":");
  return parts.length === 3 && ["block-coding", "blocks-to-text", "programming-web", "applied"].includes(parts[0]!) && /^[a-f0-9]{64}$/.test(parts[1]!) && /^[a-z0-9-]{1,100}$/.test(parts[2]!) ? parts[2]! : null;
}
