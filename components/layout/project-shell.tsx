"use client";

import { useState, useEffect } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useProjectStore } from "@/store/project-store";

interface ProjectShellProps {
  projectId: string;
  children: React.ReactNode;
}

interface ProjectInfo {
  name: string;
  hypotheses: string[];
}

export function ProjectShell({ projectId, children }: ProjectShellProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    name: "当前项目",
    hypotheses: [],
  });
  const { papers } = useProjectStore();

  // 从 API 获取项目信息
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.project) {
          setProjectInfo({
            name: d.project.name,
            hypotheses: d.project.hypotheses?.map((h: { statement: string }) => h.statement) || [],
          });
        }
      })
      .catch((err) => {
        console.error("[ProjectShell] Failed to load project info:", err);
      });
  }, [projectId]);

  const projectContext = {
    name: projectInfo.name,
    papers: papers.slice(0, 10).map((p) => p.title),
    hypotheses: projectInfo.hypotheses,
  };

  return (
    <>
      <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
      <ChatPanel
        isOpen={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
        projectId={projectId}
        projectContext={projectContext}
      />
    </>
  );
}
