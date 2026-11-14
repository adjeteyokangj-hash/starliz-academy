import { NextResponse } from "next/server";
import { z } from "zod";
import { demonstrationAttachmentSchema } from "./demonstration-contract";
import { readDemonstration } from "./demonstration-storage";
export const demonstrationReadSchema = z.object({ activityId: z.string().min(1).max(100), attachment: demonstrationAttachmentSchema, studentId: z.string().min(1).max(100).optional(), bookingId: z.string().min(1).max(100).optional() }).strict();
export async function privateDemonstrationResponse(childId: string, body: z.infer<typeof demonstrationReadSchema>) {
  const bytes = await readDemonstration(childId, body.attachment, body.activityId);
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "video/webm", "Content-Length": String(bytes.length), "Content-Disposition": 'inline; filename="private-coding-demonstration.webm"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer" } });
}
