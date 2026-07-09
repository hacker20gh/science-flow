"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "我的项目", href: "/", icon: "📁" },
  { label: "📚 知识库", href: "/knowledge", icon: "" },
  { label: "🎓 设计课", href: "/courses", icon: "" },
  { label: "⚙️ 设置", href: "/settings", icon: "" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-gray-200 h-full flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <Link href="/" className="text-lg font-bold text-blue-600">
          🔬 SciFlow AI
        </Link>
        <p className="text-xs text-gray-500 mt-1">科研全流程工作流</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {item.icon} {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm">
            U
          </div>
          <div className="text-sm truncate">用户</div>
        </div>
      </div>
    </aside>
  );
}
