import { handleAdminUsageEventsPost } from "./route.handler"

export async function POST(request: Request) {
  return handleAdminUsageEventsPost(request)
}