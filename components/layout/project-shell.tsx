"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useProjectStore } from "@/store/project-store";

interface ProjectShellProps {
  projectId: string;
  children: React.ReactNode;
}

export function ProjectShell({ projectId, children }: ProjectShellProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const { papers } = useProjectStore();

  const projectContext = {
    name: "PD-1 耐药机制在肝癌中的研究",
    papers: papers.slice(0, 10).map((p) => p.title),
    hypotheses: ["sorafenib 通过 NF-κB 上调 HCC 中的 PD-L1 表达"],
  };

  return (
    <>
      <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
      <ChatPanel
        isOpen={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
        projectContext={projectContext}
      />
    </>
  );
}
