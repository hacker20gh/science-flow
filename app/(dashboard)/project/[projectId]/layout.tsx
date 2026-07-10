import { Sidebar } from "@/components/layout/sidebar";
import { ProjectShell } from "@/components/layout/project-shell";
import { QuickActionBar } from "@/components/layout/quick-action-bar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="flex h-screen">
      <Sidebar projectId={projectId} />
      <ProjectShell projectId={projectId}>{children}</ProjectShell>
      <QuickActionBar />
    </div>
  );
}
