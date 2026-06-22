import { NextResponse } from "next/server";
import { handleAdminContentPublishPost } from "../publish.handler";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return handleAdminContentPublishPost(request, context);
}
