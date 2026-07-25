/**
 * Shared admin shell — no auth here.
 * Public login lives under `(public)/login`.
 * Authenticated console lives under `(secure)` and gates there.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
