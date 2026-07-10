import type { Metadata } from "next";
import { Providers } from "@/components/layout/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
      className={cn("h-full antialiased", "font-sans", geist.variable)}
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
