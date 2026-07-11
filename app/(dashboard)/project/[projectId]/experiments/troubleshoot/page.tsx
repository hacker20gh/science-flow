"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { TroubleshootForm, DiagnosisResult } from "@/components/experiment/troubleshoot";
import { consumeSSEStream } from "@/lib/llm/sse-consumer";
import type { TroubleshootResult } from "@/lib/llm/troubleshoot";

export default function TroubleshootPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [view, setView] = useState<"form" | "diagnosing" | "result">("form");
  const [result, setResult] = useState<TroubleshootResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("");

  // Restore existing troubleshoot result on page load
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/experiments?type=troubleshoot`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.experiment?.troubleshoot) {
          setResult(data.experiment.troubleshoot as TroubleshootResult);
          setView("result");
        }
      })
      .catch((err) => {
        console.error("[Troubleshoot] Failed to restore results:", err);
      }); // silently ignore restore failures
  }, [projectId]);

  // Save troubleshoot result to DB
  const saveToDb = useCallback(
    (experimentName: string, troubleshoot: TroubleshootResult) => {
      fetch(`/api/projects/${projectId}/experiments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentName, troubleshoot }),
      }).catch((err) => console.error("Failed to save troubleshoot result:", err));
    },
    [projectId]
  );

  async function handleSubmit(data: {
    experiment: {
      name: string;
      drug: string;
      concentration: string;
      cellLine: string;
      passage?: string;
      duration: string;
      readouts: string[];
    };
    failure: { phenomenon: string; details?: string };
  }) {
    setView("diagnosing");
    setError(null);

    setProgressMessage("");

    let res: Response;
    try {
      res = await fetch("/api/experiments/troubleshoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "诊断失败");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "诊断失败");
      setView("form");
      return;
    }

    consumeSSEStream(res, {
      onProgress: (step) => {
        setProgressMessage(step || "正在分析...");
      },
      onResult: (data_) => {
        const troubleshootData = data_ as TroubleshootResult;
        setResult(troubleshootData);
        setView("result");
        saveToDb(data.experiment.name, troubleshootData);
      },
      onError: (message) => {
        setError(message);
        setView("form");
      },
      onDone: () => {},
    });
  }

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">🔬 实验排障</h1>
      <p className="text-gray-500 mb-6 text-sm">
        实验失败了？描述你的情况，AI 帮你分析可能的原因
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {view === "form" && (
        <TroubleshootForm onSubmit={handleSubmit} isLoading={false} />
      )}

      {view === "diagnosing" && (
        <div className="text-center py-12 space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">{progressMessage || "正在分析失败原因..."}</p>
          <p className="text-xs text-gray-400">
            AI 正在结合你的实验条件和文献数据进行诊断
          </p>
        </div>
      )}

      {view === "result" && result && (
        <DiagnosisResult
          result={result}
          onRetry={() => {
            setView("form");
            setResult(null);
          }}
        />
      )}
    </main>
  );
}
