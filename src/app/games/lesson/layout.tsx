import type { ReactNode } from "react";

import TutorRuntimeDebugPanel from "@/components/tutor/TutorRuntimeDebugPanel";

export default function LessonLayout({ children }: { children: ReactNode }) {
  const isDev = process.env.NODE_ENV === "development";
  return (
    <>
      {children}
      {isDev ? <TutorRuntimeDebugPanel /> : null}
    </>
  );
}
