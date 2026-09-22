import { redirect } from "next/navigation";

/** Parent PIN setup/verify UI is retired. Parents go straight to the portal. */
export default function ParentPinPage() {
  redirect("/parent/dashboard");
}
