import ParentSessionKeepAlive from "@/components/parent/ParentSessionKeepAlive";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ParentSessionKeepAlive />
      {children}
    </>
  );
}
