import SessionKeepAlive from "@/components/auth/SessionKeepAlive";

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SessionKeepAlive loginPath="/auth/login" />
      {children}
    </>
  );
}
