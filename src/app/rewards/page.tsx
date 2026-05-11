import { redirect } from "next/navigation";

export default function RewardsPage() {
  redirect("/shop?from=rewards");
}
