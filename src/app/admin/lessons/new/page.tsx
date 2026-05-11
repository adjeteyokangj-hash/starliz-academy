import { redirect } from "next/navigation";

export default function NewLessonPage() {
  redirect("/admin/lessons");
}
