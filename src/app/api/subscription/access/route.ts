import { NextResponse } from "next/server";
import { handleSubscriptionAccessGet } from "../access.handler";

export async function GET(request: Request): Promise<NextResponse> {
  return handleSubscriptionAccessGet(request);
}
