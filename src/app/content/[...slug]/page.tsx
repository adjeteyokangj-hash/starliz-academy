import { redirect } from "next/navigation";

export default function LegacyContentCatchAllRedirectPage() {
  redirect("/");
}
