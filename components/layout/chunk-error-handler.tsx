"use client";

import { useEffect } from "react";

/**
 * 全局 ChunkLoadError 捕获与自动重试
 * Turbopack 在 Windows 上的热更新 chunk 容易失效，
 * 这个组件捕获错误并自动重试加载，避免白屏。
 */
export function ChunkErrorHandler() {
  useEffect(() => {
    // 拦截 webpack/turbopack 的动态 import 失败
    const originalFetch = window.fetch;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    // 监听 chunk 加载失败
    const handleError = (event: ErrorEvent) => {
      const isChunkError =
        event.message?.includes("ChunkLoadError") ||
        event.message?.includes("Loading chunk") ||
        event.message?.includes("Failed to load chunk") ||
        event.filename?.includes("_next/static/chunks");

      if (isChunkError && retryCount < MAX_RETRIES) {
        retryCount++;
        console.warn(
          `[ChunkRetry] 检测到 chunk 加载失败，自动重试 ${retryCount}/${MAX_RETRIES}...`
        );
        // 给 turbopack 一点时间恢复，然后 reload
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    };

    // 监听 unhandled rejection（async chunk 加载失败）
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = String(event.reason ?? "");
      const isChunkError =
        reason.includes("ChunkLoadError") ||
        reason.includes("Loading chunk") ||
        reason.includes("Failed to load chunk");

      if (isChunkError && retryCount < MAX_RETRIES) {
        retryCount++;
        console.warn(
          `[ChunkRetry] 检测到 chunk Promise 失败，自动重试 ${retryCount}/${MAX_RETRIES}...`
        );
        event.preventDefault();
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
