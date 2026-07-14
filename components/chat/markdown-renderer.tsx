"use client";

import { useState, useEffect } from "react";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const [modules, setModules] = useState<{
    ReactMarkdown: typeof import("react-markdown")["default"];
    remarkGfm: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  } | null>(null);

  useEffect(() => {
    Promise.all([
      import("react-markdown"),
      import("remark-gfm"),
    ]).then(([rm, gfm]) => {
      setModules({
        ReactMarkdown: rm.default,
        remarkGfm: gfm.default,
      });
    });
  }, []);

  if (!modules) {
    return (
      <div className="prose-chat">
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  const { ReactMarkdown, remarkGfm } = modules;

  const components: Components = {
    // 代码块带复制按钮
    pre: ({ children }) => (
      <div className="relative group my-2">
        <pre className="bg-gray-900 text-gray-100 rounded-md p-3 text-xs overflow-x-auto">
          {children}
        </pre>
        <button
          onClick={() => {
            const text = (children as { props?: { children?: string } })?.props?.children || "";
            navigator.clipboard.writeText(typeof text === "string" ? text : "");
          }}
          className="absolute top-1 right-1 px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600"
        >
          复制
        </button>
      </div>
    ),
    // 行内代码
    code: ({ children, className }) => {
      if (className) return <code className={className}>{children}</code>;
      return <code className="bg-gray-100 px-1 py-0.5 rounded text-xs text-red-600">{children}</code>;
    },
    // 链接可点击
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
        {children}
      </a>
    ),
    // 表格样式
    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="text-xs border-collapse border border-gray-300">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-gray-300 px-2 py-1 bg-gray-50 font-medium">{children}</th>,
    td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
    // 列表
    ul: ({ children }) => <ul className="list-disc pl-5 space-y-0.5 my-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-0.5 my-1">{children}</ol>,
    li: ({ children }) => <li className="text-sm">{children}</li>,
    // 段落
    p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
    // 标题
    h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
    h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
    // 强调
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    // 引用块
    blockquote: ({ children }) => (
      <blockquote className="border-l-3 border-blue-300 pl-3 py-1 my-2 bg-blue-50 text-sm text-gray-700 italic">
        {children}
      </blockquote>
    ),
  };

  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
