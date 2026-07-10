import type { Metadata } from "next";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SciFlow AI — 科研全流程工作流",
  description:
    "AI 驱动的科研工作流网站，覆盖从文献调研到实验设计到论文发表的完整链路。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
