"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { AssistantCard } from "@/lib/assistant/process-assistant";

interface ProcessAssistantProps {
  cards: AssistantCard[];
  basePath: string;
  projectId?: string;
}

export function ProcessAssistant({ cards, basePath, projectId }: ProcessAssistantProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [enrichedCards, setEnrichedCards] = useState<AssistantCard[]>(cards);

  // 规则匹配后，异步调用 LLM 增强文案
  const enrichCards = useCallback(async () => {
    if (!projectId || cards.length === 0) return;

    try {
      const res = await fetch("/api/assistant/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, cards }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.cards?.length > 0) {
          setEnrichedCards(data.cards);
        }
      }
    } catch {
      // 失败时保留模板消息，不影响用户体验
    }
  }, [projectId, cards]);

  useEffect(() => {
    setEnrichedCards(cards);
    // 延迟 500ms 后调用 LLM 增强（不阻塞初始渲染）
    const timer = setTimeout(enrichCards, 500);
    return () => clearTimeout(timer);
  }, [cards, enrichCards]);

  const visibleCards = enrichedCards
    .filter((c) => !dismissed.has(c.id))
    .sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.priority] - priority[b.priority];
    });

  if (visibleCards.length === 0) return null;

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
  }

  return (
    <div className="space-y-2 mb-6">
      {visibleCards.map((card) => (
        <div
          key={card.id}
          className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
            card.priority === "high"
              ? "bg-amber-50 border-amber-200"
              : "bg-blue-50 border-blue-100"
          } ${card.enriched ? "ring-1 ring-blue-200" : ""}`}
        >
          <span className="text-base shrink-0 mt-0.5">{card.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-gray-800">{card.title}</p>
              {card.enriched && (
                <span className="text-[10px] text-blue-500 bg-blue-50 px-1 rounded">AI</span>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1">{card.message}</p>
            {card.actionLabel && (
              <div className="mt-2">
                {card.actionHref ? (
                  <Link
                    href={`${basePath}/${card.actionHref}`}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {card.actionLabel} →
                  </Link>
                ) : (
                  <span className="text-xs text-blue-600 font-medium cursor-pointer">
                    {card.actionLabel}
                  </span>
                )}
              </div>
            )}
          </div>
          {card.dismissible && (
            <button
              onClick={() => dismiss(card.id)}
              className="text-gray-400 hover:text-gray-600 text-xs shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
