"use client";

import SessionKeepAlive from "@/components/auth/SessionKeepAlive";

export default function AdminSessionKeepAlive() {
  return <SessionKeepAlive loginPath="/admin/login" />;
}
