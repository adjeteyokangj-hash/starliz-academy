import { NextResponse } from "next/server"
import { getPublicPricingListing } from "@/lib/pricing/service"

export async function GET() {
  const plans = await getPublicPricingListing()
  return NextResponse.json({ plans })
}
