import SessionKeepAlive from "@/components/auth/SessionKeepAlive";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SessionKeepAlive loginPath="/auth/login" refreshPin />
      {children}
    </>
  );
}
