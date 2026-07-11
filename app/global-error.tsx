"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5L12 3z"
              />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">
            出了一点问题
          </h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            页面遇到了意外错误，请尝试刷新。如果问题持续存在，请联系支持团队。
          </p>

          {process.env.NODE_ENV === "development" && error?.message && (
            <div className="mb-6 p-3 bg-gray-50 border border-gray-100 rounded-lg text-left">
              <p className="text-xs font-mono text-gray-600 break-all">
                {error.message}
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              重试
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              返回首页
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
