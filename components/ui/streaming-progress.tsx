"use client";

import { useState, useEffect, useRef } from "react";
import { consumeSSEStream, type SSEConsumerOptions } from "@/lib/llm/sse-consumer";

interface StreamingProgressProps {
  response?: Response | null;
  externalText?: string;
  step?: string;
  current?: number;
  total?: number;
  loading?: boolean;
  onCancel?: () => void;
  onResult?: (data: unknown) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export default function StreamingProgress({
  response,
  externalText,
  step,
  current,
  total,
  loading,
  onCancel,
  onResult,
  onError,
  onDone,
}: StreamingProgressProps) {
  const [streamedText, setStreamedText] = useState("");
  const [progress, setProgress] = useState({ step: "", current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!response) return;
    setStreamedText("");
    setError(null);

    const options: SSEConsumerOptions = {
      onText: (text) => setStreamedText((prev) => prev + text),
      onProgress: (s, c, t) => setProgress({ step: s, current: c, total: t }),
      onResult: (data) => onResult?.(data),
      onError: (msg) => { setError(msg); onError?.(msg); },
      onDone: () => onDone?.(),
    };

    consumeSSEStream(response, options).catch((err) => {
      const msg = err instanceof Error ? err.message : "流读取失败";
      setError(msg);
      onError?.(msg);
    });
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [streamedText]);

  const displayText = externalText || streamedText;
  const displayStep = step || progress.step;
  const displayCurrent = current ?? progress.current;
  const displayTotal = total ?? progress.total;

  if (!loading && !displayText && !error) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {(displayStep || displayTotal > 0) && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-3 text-xs">
          {loading && (
            <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          )}
          <span className="text-blue-700">{displayStep}</span>
          {displayTotal > 0 && (
            <span className="text-blue-500 ml-auto">{displayCurrent}/{displayTotal}</span>
          )}
          {onCancel && loading && (
            <button onClick={onCancel} className="text-red-500 hover:text-red-700 ml-2">取消</button>
          )}
        </div>
      )}
      {displayText && (
        <div ref={containerRef} className="px-4 py-3 max-h-[300px] overflow-y-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
            {displayText}
            {loading && <span className="inline-block w-1.5 h-3.5 bg-blue-500 animate-pulse ml-0.5" />}
          </pre>
        </div>
      )}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
          ❌ {error}
        </div>
      )}
    </div>
  );
}
