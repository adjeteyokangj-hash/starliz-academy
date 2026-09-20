import { NextResponse } from "next/server";

/** Parent PIN is retired (Slice 5). Endpoints remain as explicit 410 stubs. */
export async function GET() {
  return NextResponse.json(
    {
      error: "Parent PIN is no longer used. Sign in with your parent email and password.",
      code: "parent_pin_retired",
    },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Parent PIN is no longer used. Sign in with your parent email and password.",
      code: "parent_pin_retired",
    },
    { status: 410 },
  );
}
