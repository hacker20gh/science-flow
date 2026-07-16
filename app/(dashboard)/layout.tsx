import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import FloatingTokenPanel from "@/components/token-usage/floating-panel";
import { ExtractionProgressPanel } from "@/components/extraction-progress-panel";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <>
      {children}
      <ExtractionProgressPanel />
      <FloatingTokenPanel />
    </>
  );
}
