import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Student override is not supported." }, { status: 405 });
}
