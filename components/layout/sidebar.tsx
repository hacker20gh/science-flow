"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  FolderOpen,
  BookOpen,
  GraduationCap,
  Settings,
  LayoutDashboard,
  Calendar,
  Brain,
  FlaskConical,
  BarChart3,
  FileText,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";

interface SidebarProps {
  projectId?: string;
}

const globalNav = [
  { label: "我的项目", href: "/", icon: FolderOpen },
  { label: "知识库", href: "/knowledge", icon: BookOpen },
  { label: "实战课", href: "/courses", icon: GraduationCap },
  { label: "设置", href: "/settings", icon: Settings },
];

function ProjectNav({ projectId, onNavigate }: { projectId: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const base = `/project/${projectId}`;

  const items = [
    { label: "概览", href: base, icon: LayoutDashboard },
    { label: "时间线", href: `${base}/timeline`, icon: Calendar },
    { label: "知识面板", href: `${base}/brain`, icon: Brain },
    { label: "文献", href: `${base}/papers`, icon: BookOpen },
    { label: "实验", href: `${base}/experiments`, icon: FlaskConical },
    { label: "数据", href: `${base}/data`, icon: BarChart3 },
    { label: "论文", href: `${base}/manuscript`, icon: FileText },
  ];

  return (
    <>
      {items.map((item) => {
        const isActive =
          item.href === base
            ? pathname === base
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
              isActive
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-primary" onClick={() => setMobileOpen(false)}>
          <FlaskConical size={22} strokeWidth={2} />
          SciFlow AI
        </Link>
        <p className="text-xs text-gray-500 mt-1 ml-7">科研全流程工作流</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {globalNav.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/" && !projectId
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              {item.label}
            </Link>
          );
        })}

        {projectId && (
          <>
            <div className="my-2 border-t border-gray-100" />
            <div className="px-3 py-1 text-xs text-gray-400 font-medium uppercase tracking-wider">
              当前项目
            </div>
            <ProjectNav projectId={projectId} onNavigate={() => setMobileOpen(false)} />
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User size={16} className="text-primary" />
            </div>
            <div className="text-sm truncate text-gray-700">
              {session?.user?.name || session?.user?.email?.split("@")[0] || "用户"}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
            title="退出登录"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-sm md:hidden"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col transform transition-transform md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-white border-r border-gray-200 h-full flex-col shrink-0">
        {sidebarContent}
      </aside>
    </>
  );
}
