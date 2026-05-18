import { redirect } from "next/navigation";

export default function LegacyProfileRoutePage() {
  redirect("/parent/dashboard");
}
