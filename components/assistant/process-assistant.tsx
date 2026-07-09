"use client";

import { useState } from "react";
import Link from "next/link";
import type { AssistantCard } from "@/lib/assistant/process-assistant";

interface ProcessAssistantProps {
  cards: AssistantCard[];
  basePath: string;
}

export function ProcessAssistant({ cards, basePath }: ProcessAssistantProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleCards = cards
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
          className={`flex items-start gap-3 p-3 rounded-lg border ${
            card.priority === "high"
              ? "bg-amber-50 border-amber-200"
              : "bg-blue-50 border-blue-100"
          }`}
        >
          <span className="text-base shrink-0 mt-0.5">{card.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{card.title}</p>
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
