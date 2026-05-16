import ParentSessionKeepAlive from "@/components/parent/ParentSessionKeepAlive";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  // Keep this layout passive; middleware already enforces auth/role/unlock routing.
  // This avoids layout-level false redirects when access tokens are rotating.

  return (
    <>
      <ParentSessionKeepAlive />
      {children}
    </>
  );
}
