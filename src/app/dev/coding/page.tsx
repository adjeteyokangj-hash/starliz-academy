import { notFound } from "next/navigation";
import CodingPlayground from "@/components/coding/CodingPlayground";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CodingPlayground />;
}
