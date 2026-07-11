import FloatingTokenPanel from "@/components/token-usage/floating-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <FloatingTokenPanel />
    </>
  );
}
