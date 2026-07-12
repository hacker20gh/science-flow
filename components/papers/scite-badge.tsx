"use client";

import { useState, useEffect } from "react";

interface SciteBadgeProps {
  doi?: string;
}

interface SciteTallies {
  supporting: number;
  contrasting: number;
  mentioning: number;
  total: number;
}

/**
 * 论文引用上下文徽章
 *
 * 显示 Scite.ai 的 Smart Citations 统计：支持/反对/提及数量。
 * 需要配置 SCITE_API_KEY 环境变量，未配置时不渲染。
 */
export default function SciteBadge({ doi }: SciteBadgeProps) {
  const [tallies, setTallies] = useState<SciteTallies | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!doi) return;

    fetch(`/api/scite?doi=${encodeURIComponent(doi)}`)
      .then((r) => r.json())
      .then((data) => {
        setEnabled(data.enabled);
        if (data.tallies) setTallies(data.tallies);
      })
      .catch(() => {});
  }, [doi]);

  if (!enabled || !tallies || tallies.total === 0) return null;

  const ratio = tallies.supporting + tallies.contrasting > 0
    ? tallies.supporting / (tallies.supporting + tallies.contrasting)
    : 1;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {tallies.supporting > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
          ✅ {tallies.supporting} 支持
        </span>
      )}
      {tallies.contrasting > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
          ❌ {tallies.contrasting} 反对
        </span>
      )}
      {tallies.supporting + tallies.contrasting > 0 && (
        <span className={`text-[10px] ${ratio >= 0.8 ? "text-green-600" : ratio >= 0.5 ? "text-amber-600" : "text-red-600"}`}>
          {Math.round(ratio * 100)}% 可信
        </span>
      )}
    </div>
  );
}
