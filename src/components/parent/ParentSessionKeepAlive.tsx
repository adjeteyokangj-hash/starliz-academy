"use client";

import SessionKeepAlive from "@/components/auth/SessionKeepAlive";

export default function ParentSessionKeepAlive() {
  return <SessionKeepAlive loginPath="/auth/login" refreshPin />;
}
