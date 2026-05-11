export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  // This layout allows unauthenticated access to /admin/login
  // It bypasses the parent admin layout's authentication check
  return children;
}
