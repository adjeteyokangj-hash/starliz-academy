import { NextResponse } from "next/server";
import { handleAttemptPost } from "../attempts.handler";

export async function POST(request: Request): Promise<NextResponse> {
  return handleAttemptPost(request);
}
