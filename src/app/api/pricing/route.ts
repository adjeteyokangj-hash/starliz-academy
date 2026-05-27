import { NextResponse } from "next/server"
import { getPublicPricingListingForCountry } from "@/lib/pricing/service"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const cookieHeader = request.headers.get("cookie") ?? ""
  const cookieCountry = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("starliz_country="))
    ?.split("=")[1] ?? null
  const country = url.searchParams.get("country") ?? cookieCountry
  const plans = await getPublicPricingListingForCountry(country)
  return NextResponse.json({ plans })
}
