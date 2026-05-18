import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireParentUnlocked } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { hashPassword } from "@/lib/auth";
import { writeChildPinState } from "@/lib/child_pin";

const WEAK_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "4321",
  "1122",
  "1212",
  "0123",
]);

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/).optional(),
  enablePin: z.boolean().optional(),
});

type Params = { params: Promise<{ childId: string }> };

export async function POST(request: Request, context: Params) {
  const { session, response } = await requireParentUnlocked();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const { childId } = await context.params;
  let body: z.infer<typeof schema>;

  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid PIN payload." }, { status: 400 });
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId, archived: false },
    select: { id: true, coachingMemoryJson: true },
  });

  if (!child) {
    return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
  }

  const shouldEnable = body.enablePin ?? Boolean(body.pin);

  if (shouldEnable && !body.pin) {
    return NextResponse.json({ error: "PIN is required when enabling child PIN." }, { status: 400 });
  }

  if (body.pin && WEAK_PINS.has(body.pin)) {
    return NextResponse.json({ error: "This PIN is too simple. Choose a stronger PIN." }, { status: 400 });
  }

  const pinHash = body.pin ? await hashPassword(body.pin) : null;

  await prisma.childProfile.update({
    where: { id: child.id },
    data: {
      coachingMemoryJson: writeChildPinState(child.coachingMemoryJson, {
        pinEnabled: shouldEnable,
        pinHash: shouldEnable ? pinHash : null,
        updatedAt: new Date().toISOString(),
      }),
    },
  });

  return NextResponse.json({ ok: true, pinEnabled: shouldEnable });
}
