# SciFlow AI Phase 1：地基工程 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SciFlow AI 建立统一的 UI 基础设施（shadcn/ui + 骨架屏 + Toast），修复所有已知 bug（事件类型不匹配、SSE 流式浪费、状态割裂、页面刷新），为后续 Phase 2–4 的功能升级奠定坚实基础。

**Architecture:** 引入 shadcn/ui 组件库作为统一设计系统，逐模块替换原生 alert/confirm/reload。修复 4 处 SSE 流式消费错误，统一时间线事件类型命名，将文献主页状态管理迁移到 Zustand。

**Tech Stack:** shadcn/ui v2+, Tailwind CSS v4, Zustand, Prisma, Sonner (Toast), React

**Spec:** `docs/superpowers/specs/2026-07-10-sciflow-comprehensive-upgrade-design.md`

**验收标准（全部完成后检查）：**
- [ ] `npx tsc --noEmit` 零错误
- [ ] 全项目 `grep -r "alert(" --include="*.tsx" --include="*.ts"` 结果为 0（排除 node_modules）
- [ ] 全项目 `grep -r "confirm(" --include="*.tsx" --include="*.ts"` 结果为 0（排除 node_modules）
- [ ] 全项目 `grep -r "window.location.reload" --include="*.tsx" --include="*.ts"` 结果为 0
- [ ] 时间线事件图标正确显示（非灰色默认 📌）
- [ ] 实验设计/排障/论文组装页面显示 SSE 进度
- [ ] 所有页面有骨架屏加载状态

---

## Task 1: shadcn/ui 初始化

**Files:**
- Create: `components.json`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: 初始化 shadcn/ui**

```bash
cd "d:/AI agent/science flow"
npx shadcn@latest init
```

选择配置：
- Style: New York
- Base color: Slate
- CSS variables: yes
- Tailwind config: 使用 CSS 变量（Tailwind v4 方式）
- Components path: `@/components/ui`
- Utils path: `@/lib/utils`

- [ ] **Step 2: 验证初始化成功**

检查 `components.json` 文件存在，`lib/utils.ts` 文件存在（包含 `cn()` 函数）。

```bash
ls components.json lib/utils.ts
```

Expected: 两个文件都存在

- [ ] **Step 3: 安装核心组件**

```bash
npx shadcn@latest add button card dialog alert-dialog skeleton tabs badge tooltip dropdown-menu sheet select input textarea progress separator scroll-area sonner
```

- [ ] **Step 4: 验证组件安装**

```bash
ls components/ui/
```

Expected: 至少包含 button.tsx, card.tsx, dialog.tsx, alert-dialog.tsx, skeleton.tsx, tabs.tsx, badge.tsx, tooltip.tsx, dropdown-menu.tsx, sheet.tsx, select.tsx, input.tsx, textarea.tsx, progress.tsx, separator.tsx, scroll-area.tsx, sonner.tsx

- [ ] **Step 5: 在根布局添加 Toaster**

修改 `app/layout.tsx`，在 `<body>` 内添加 Sonner 的 `<Toaster />` 组件：

```tsx
import { Toaster } from "@/components/ui/sonner"

// 在 body 内添加：
<body>
  {children}
  <Toaster />
</body>
```

- [ ] **Step 6: TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: initialize shadcn/ui with core components"
```

**🔴 CHECKPOINT:** 运行 `npx tsc --noEmit` 确认零编译错误。启动 dev server (`npm run dev`) 确认页面正常加载。

---

## Task 2: 全局骨架屏组件

**Files:**
- Create: `components/skeletons/papers-skeleton.tsx`
- Create: `components/skeletons/matrix-skeleton.tsx`
- Create: `components/skeletons/timeline-skeleton.tsx`
- Create: `components/skeletons/dashboard-skeleton.tsx`
- Create: `components/skeletons/experiments-skeleton.tsx`
- Create: `components/skeletons/data-skeleton.tsx`
- Create: `components/skeletons/manuscript-skeleton.tsx`
- Create: `components/skeletons/index.ts`

- [ ] **Step 1: 创建 papers-skeleton.tsx**

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function PapersSkeleton() {
  return (
    <div className="space-y-4">
      {/* 统计卡片骨架 */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 border border-slate-200">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      {/* 搜索栏骨架 */}
      <div className="bg-white rounded-lg p-4 border border-slate-200">
        <Skeleton className="h-10 w-full" />
      </div>
      {/* 论文卡片骨架 */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg p-4 border border-slate-200">
          <div className="flex items-start gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 创建 matrix-skeleton.tsx**

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function MatrixSkeleton() {
  return (
    <div className="space-y-4">
      {/* 工具栏骨架 */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-md" />
        ))}
        <div className="flex-1" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      {/* 统计栏骨架 */}
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-28" />
        ))}
      </div>
      {/* 表格骨架 */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        {/* 表头 */}
        <div className="flex bg-slate-50 p-3 border-b">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-24 ml-4" />
          ))}
        </div>
        {/* 行 */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex p-3 border-b last:border-0">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-5 w-16 ml-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建 timeline-skeleton.tsx**

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {/* 筛选栏骨架 */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      {/* 事件骨架 */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 创建 dashboard-skeleton.tsx**

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* 标题 + 按钮 */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>
      {/* 项目卡片网格 */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-5 border border-slate-200 space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 创建 experiments-skeleton.tsx**

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function ExperimentsSkeleton() {
  return (
    <div className="space-y-6">
      {/* 上下文预览 */}
      <div className="bg-white rounded-lg p-4 border border-slate-200">
        <Skeleton className="h-5 w-48 mb-3" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {/* 输入区或结果区 */}
      <div className="bg-white rounded-lg p-6 border border-slate-200 space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-32 w-full rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 创建 data-skeleton.tsx**

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function DataSkeleton() {
  return (
    <div className="space-y-6">
      {/* 上传区骨架 */}
      <div className="border-2 border-dashed border-slate-200 rounded-lg p-12 flex flex-col items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 创建 manuscript-skeleton.tsx**

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function ManuscriptSkeleton() {
  return (
    <div className="space-y-6">
      {/* 上下文预览 */}
      <div className="bg-white rounded-lg p-4 border border-slate-200">
        <Skeleton className="h-5 w-48 mb-3" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {/* 章节卡片网格 */}
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 border border-slate-200 space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 创建 index.ts 统一导出**

```tsx
export { PapersSkeleton } from "./papers-skeleton"
export { MatrixSkeleton } from "./matrix-skeleton"
export { TimelineSkeleton } from "./timeline-skeleton"
export { DashboardSkeleton } from "./dashboard-skeleton"
export { ExperimentsSkeleton } from "./experiments-skeleton"
export { DataSkeleton } from "./data-skeleton"
export { ManuscriptSkeleton } from "./manuscript-skeleton"
```

- [ ] **Step 9: TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 10: Commit**

```bash
git add components/skeletons/
git commit -m "feat: add skeleton components for all modules"
```

**🔴 CHECKPOINT:** 确认 8 个骨架屏文件全部创建，`npx tsc --noEmit` 零错误。

---

## Task 3: Toast 替换 — 项目管理页面

**Files:**
- Modify: `app/(dashboard)/page.tsx` (lines 65, 93, 96, 111, 114)

- [ ] **Step 1: 添加 toast import**

在文件顶部添加：
```tsx
import { toast } from "sonner"
```

- [ ] **Step 2: 替换 line 65 — 创建失败**

将：
```tsx
alert("创建失败");
```
替换为：
```tsx
toast.error("创建失败", { description: "无法创建项目，请稍后重试" });
```

- [ ] **Step 3: 替换 line 93 — 保存失败（API 错误）**

将：
```tsx
alert(data.error || "保存失败");
```
替换为：
```tsx
toast.error("保存失败", { description: data.error || "无法保存项目信息" });
```

- [ ] **Step 4: 替换 line 96 — 保存失败（网络错误）**

将：
```tsx
alert("保存失败");
```
替换为：
```tsx
toast.error("保存失败", { description: "网络错误，请检查连接后重试" });
```

- [ ] **Step 5: 替换 line 111 — 删除失败（API 错误）**

将：
```tsx
alert(data.error || "删除失败");
```
替换为：
```tsx
toast.error("删除失败", { description: data.error || "无法删除项目" });
```

- [ ] **Step 6: 替换 line 114 — 删除失败（网络错误）**

将：
```tsx
alert("删除失败");
```
替换为：
```tsx
toast.error("删除失败", { description: "网络错误，请检查连接后重试" });
```

- [ ] **Step 7: 验证**

```bash
npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 8: Commit**

```bash
git add app/\(dashboard\)/page.tsx
git commit -m "refactor: replace alerts with toasts in project management page"
```

**🔴 CHECKPOINT:** 在浏览器中打开项目列表页面，尝试创建/编辑/删除项目，确认 Toast 通知正确显示（不再弹出原生 alert）。

---

## Task 4: Toast 替换 — 项目详情页

**Files:**
- Modify: `app/(dashboard)/project/[projectId]/page.tsx` (lines 77, 80)

- [ ] **Step 1: 添加 toast import**

在文件顶部添加：
```tsx
import { toast } from "sonner"
```

- [ ] **Step 2: 替换 line 77 — 保存失败（API 错误）**

将：
```tsx
alert(data.error || "保存失败");
```
替换为：
```tsx
toast.error("保存失败", { description: data.error || "无法保存项目信息" });
```

- [ ] **Step 3: 替换 line 80 — 保存失败（网络错误）**

将：
```tsx
alert("保存失败");
```
替换为：
```tsx
toast.error("保存失败", { description: "网络错误，请检查连接后重试" });
```

- [ ] **Step 4: 验证 + Commit**

```bash
npx tsc --noEmit
git add app/\(dashboard\)/project/\[projectId\]/page.tsx
git commit -m "refactor: replace alerts with toasts in project detail page"
```

---

## Task 5: Toast 替换 — 实验页面

**Files:**
- Modify: `app/(dashboard)/project/[projectId]/experiments/page.tsx` (line 213)

- [ ] **Step 1: 添加 toast import**

在文件顶部添加：
```tsx
import { toast } from "sonner"
```

- [ ] **Step 2: 替换 line 213 — 保存成功**

将：
```tsx
alert("实验方案已保存！");
```
替换为：
```tsx
toast.success("实验方案已保存", { description: "可在实验列表中查看" });
```

- [ ] **Step 3: 验证 + Commit**

```bash
npx tsc --noEmit
git add app/\(dashboard\)/project/\[projectId\]/experiments/page.tsx
git commit -m "refactor: replace alert with toast in experiment page"
```

---

## Task 6: Toast + AlertDialog 替换 — 文献管理页面

**Files:**
- Modify: `app/(dashboard)/project/[projectId]/papers/page.tsx` (lines 192, 195, 202, 214, 221, 446, 448, 451)

这是改动最多的文件，包含 5 个 alert + 2 个 confirm + 1 个 reload。

- [ ] **Step 1: 添加 imports**

在文件顶部添加：
```tsx
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
```

- [ ] **Step 2: 添加确认对话框状态**

在组件函数内添加状态：
```tsx
const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single' | 'batch'; id?: string } | null>(null)
```

- [ ] **Step 3: 替换 line 192 — 批量提取成功**

将：
```tsx
alert(`提取完成：${data.summary?.success || 0} 篇成功`);
```
替换为：
```tsx
toast.success("批量提取完成", {
  description: `成功提取 ${data.summary?.success || 0} 篇文献的实验数据`
});
```

- [ ] **Step 4: 替换 line 195 — 批量提取失败**

将：
```tsx
alert("批量提取失败");
```
替换为：
```tsx
toast.error("批量提取失败", { description: "请稍后重试" });
```

- [ ] **Step 5: 替换 line 202 — 批量删除确认（confirm → AlertDialog）**

将：
```tsx
if (!confirm(`确定删除 ${selected.size} 篇文献？此操作不可撤销。`)) return;
```
替换为：
```tsx
setDeleteConfirm({ type: 'batch' });
return;
```

然后在 JSX 中添加 AlertDialog 组件（在组件 return 末尾）：
```tsx
{deleteConfirm && (
  <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {deleteConfirm.type === 'batch'
            ? `确定删除 ${selected.size} 篇文献？`
            : "确定删除这篇文献？"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          此操作不可撤销，相关的提取数据也将被删除。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction onClick={() => {
          if (deleteConfirm.type === 'batch') {
            handleBatchDelete();
          } else if (deleteConfirm.id) {
            handleDelete(deleteConfirm.id);
          }
          setDeleteConfirm(null);
        }}>确定删除</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)}
```

需要将 `handleBatchDelete` 和 `handleDelete` 的核心逻辑提取为不包含 confirm 的纯函数。

- [ ] **Step 6: 替换 line 214 — 批量删除失败**

将：
```tsx
alert("批量删除失败");
```
替换为：
```tsx
toast.error("批量删除失败", { description: "请稍后重试" });
```

- [ ] **Step 7: 替换 line 221 — 单篇删除确认（confirm → AlertDialog）**

将：
```tsx
if (!confirm("确定删除这篇文献？")) return;
```
替换为：
```tsx
setDeleteConfirm({ type: 'single', id: paperId });
return;
```

- [ ] **Step 8: 替换 line 446 — 单篇提取成功**

将：
```tsx
alert(`提取完成：${exps.length} 个实验`);
```
替换为：
```tsx
toast.success("提取完成", { description: `提取到 ${exps.length} 个实验数据` });
```

- [ ] **Step 9: 替换 line 448 — 消除 window.location.reload()**

将：
```tsx
window.location.reload();
```
替换为状态更新：
```tsx
// 更新本地 papers 状态，刷新该论文的提取数据
setPapers(prev => prev.map(p =>
  p.id === paperId
    ? { ...p, extractions: [...(p.extractions || []), ...exps.map((e: unknown, i: number) => ({ id: `new-${Date.now()}-${i}`, experiments: e, ...e }))] }
    : p
));
```

注意：这里需要仔细处理 extraction 数据的结构。最简单的方案是重新 fetch 论文列表：
```tsx
// 重新获取论文列表（替代 window.location.reload）
const updatedPapers = await fetch(`/api/projects/${projectId}/papers`);
if (updatedPapers.ok) {
  const data = await updatedPapers.json();
  setPapers(data.papers);
}
```

- [ ] **Step 10: 替换 line 451 — 单篇提取失败**

将：
```tsx
alert("提取失败");
```
替换为：
```tsx
toast.error("提取失败", { description: "请稍后重试" });
```

- [ ] **Step 11: 验证**

```bash
npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 12: Commit**

```bash
git add app/\(dashboard\)/project/\[projectId\]/papers/page.tsx
git commit -m "refactor: replace all alerts/confirms/reload with Toast and AlertDialog in papers page"
```

**🔴 CHECKPOINT:** 在浏览器中打开文献管理页面，测试：
1. 批量选择文献 → 点击"批量提取" → 确认 Toast 成功通知
2. 选择文献 → 点击"批量删除" → 确认 AlertDialog 弹窗 → 取消/确认
3. 单篇论文 → 点击"提取" → 确认 Toast 通知 + 页面不刷新但数据更新
4. 单篇论文 → 点击"删除" → 确认 AlertDialog 弹窗

---

## Task 7: Toast 替换 — 搜索页面

**Files:**
- Modify: `app/(dashboard)/project/[projectId]/papers/search/page.tsx` (line 299)

- [ ] **Step 1: 添加 toast import + 替换**

在文件顶部添加：
```tsx
import { toast } from "sonner"
```

将 line 299：
```tsx
alert("提取结果已保存！前往知识面板查看机制矩阵");
```
替换为：
```tsx
toast.success("提取结果已保存", {
  description: "前往知识面板查看机制矩阵",
  action: {
    label: "查看矩阵",
    onClick: () => router.push(`/project/${projectId}/brain`)
  }
});
```

需要确认 `router` 已从 `useRouter()` 获取（检查文件是否已有）。

- [ ] **Step 2: 验证 + Commit**

```bash
npx tsc --noEmit
git add app/\(dashboard\)/project/\[projectId\]/papers/search/page.tsx
git commit -m "refactor: replace alert with toast in search page"
```

---

## Task 8: 时间线事件类型统一

**Files:**
- Modify: `lib/timeline/events.ts`
- Modify: `components/timeline/timeline.tsx`
- Modify: `app/api/projects/[projectId]/papers/route.ts` (line 63)
- Modify: `app/api/projects/[projectId]/extractions/route.ts` (line 54)
- Modify: `app/api/projects/[projectId]/extractions/batch/route.ts` (line 61)
- Modify: `app/api/projects/[projectId]/upload/extract/route.ts` (line 70)
- Modify: `app/api/projects/[projectId]/hypotheses/route.ts` (line 61)
- Modify: `lib/llm/chat-tools.ts` (line 267)
- Modify: `app/api/projects/[projectId]/experiments/route.ts` (line 59)
- Modify: `app/api/projects/[projectId]/manuscripts/route.ts` (line 56)

**策略：** 统一使用服务端的类型名（更简洁），客户端 `EVENT_CONFIG` 适配服务端类型名。

- [ ] **Step 1: 修改 `lib/timeline/events.ts`**

将 `TimelineEventType` 和 `EVENT_CONFIG` 改为匹配服务端类型名：

```typescript
export type TimelineEventType =
  | "literature"
  | "hypothesis"
  | "experiment_design"
  | "experiment_completed"
  | "experiment_failed"
  | "pivot"
  | "matrix_updated"
  | "manuscript"
  | "data_upload"

export const EVENT_CONFIG: Record<TimelineEventType, { icon: string; label: string; color: string; bgColor: string }> = {
  literature: { icon: "📖", label: "文献操作", color: "text-blue-600", bgColor: "bg-blue-100" },
  hypothesis: { icon: "💡", label: "假设提出", color: "text-amber-600", bgColor: "bg-amber-100" },
  experiment_design: { icon: "🧪", label: "实验设计", color: "text-green-600", bgColor: "bg-green-100" },
  experiment_completed: { icon: "✅", label: "实验完成", color: "text-green-700", bgColor: "bg-green-100" },
  experiment_failed: { icon: "⚠️", label: "实验失败", color: "text-red-600", bgColor: "bg-red-100" },
  pivot: { icon: "🔀", label: "方向调整", color: "text-purple-600", bgColor: "bg-purple-100" },
  matrix_updated: { icon: "📊", label: "矩阵更新", color: "text-blue-600", bgColor: "bg-blue-100" },
  manuscript: { icon: "📝", label: "论文操作", color: "text-gray-600", bgColor: "bg-gray-100" },
  data_upload: { icon: "📊", label: "数据上传", color: "text-teal-600", bgColor: "bg-teal-100" },
}
```

- [ ] **Step 2: 修改 `components/timeline/timeline.tsx`**

确保 `getConfig()` 函数正确引用新的 `EVENT_CONFIG`。如果文件中还有对旧类型名的引用（如 demo 数据中的 `literature_search`），一并更新。

- [ ] **Step 3: 修改 demo 数据（如果有）**

检查 `lib/timeline/events.ts` 中的 `DEMO_EVENTS`，将所有旧类型名替换为新类型名。

- [ ] **Step 4: 验证服务端代码无需修改**

服务端 API 已经使用 `literature`、`hypothesis`、`experiment_design`、`manuscript` 这些类型名，无需修改。只需确认：
- `papers/route.ts` line 63: `type: "literature"` ✓
- `extractions/route.ts` line 54: `type: "literature"` ✓
- `extractions/batch/route.ts` line 61: `type: "literature"` ✓
- `upload/extract/route.ts` line 70: `type: "literature"` ✓
- `hypotheses/route.ts` line 61: `type: "hypothesis"` ✓
- `chat-tools.ts` line 267: `type: "hypothesis"` ✓
- `experiments/route.ts` line 59: `type: "experiment_design"` ✓
- `manuscripts/route.ts` line 56: `type: "manuscript"` ✓

- [ ] **Step 5: TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 零错误（如果有类型错误，说明还有地方引用旧类型名，逐一修复）

- [ ] **Step 6: Commit**

```bash
git add lib/timeline/events.ts components/timeline/timeline.tsx
git commit -m "fix: unify timeline event types between client and server"
```

**🔴 CHECKPOINT:** 在浏览器中打开时间线页面，确认：
1. 所有事件显示正确的彩色图标（非灰色 📌）
2. demo 事件（如果有）图标正确
3. 筛选按钮正确显示事件类型标签

---

## Task 9: SSE 流式消费修复 — 实验设计页面

**Files:**
- Modify: `app/(dashboard)/project/[projectId]/experiments/page.tsx` (lines 55-76)

- [ ] **Step 1: 添加 consumeSSEStream import**

```tsx
import { consumeSSEStream } from "@/lib/llm/streaming"
```

- [ ] **Step 2: 重写 handleGenerate 函数**

将 lines 55-76 的 `handleGenerate` 从 `res.json()` 改为 SSE 消费：

```tsx
async function handleGenerate() {
  if (!hypothesis.trim()) return;
  setIsGenerating(true);
  setError(null);

  try {
    const res = await fetch("/api/experiments/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hypothesis,
        matrixSummary,
        existingExperiments: [],
        gapOrConflict: suggestions[0] || "",
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "生成失败");
    }

    // 使用 consumeSSEStream 替代 res.json()
    consumeSSEStream(res, {
      onProgress: (data) => {
        // 显示进度信息
        console.log("进度:", data.message);
      },
      onResult: (data) => {
        setDesign(data);
        setIsGenerating(false);
      },
      onError: (message) => {
        setError(message);
        setIsGenerating(false);
      },
      onDone: () => {
        setIsGenerating(false);
      },
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "生成失败");
    setIsGenerating(false);
  }
}
```

- [ ] **Step 3: 添加进度状态显示**

在 generating 状态的 UI 中添加进度消息显示：

```tsx
const [progressMessage, setProgressMessage] = useState<string>("")
```

在 `onProgress` 回调中更新：
```tsx
onProgress: (data) => {
  setProgressMessage(data.message || "正在生成...");
},
```

在生成中的 UI 中显示进度：
```tsx
{isGenerating && (
  <div className="text-center py-12">
    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
    <p className="text-slate-600">{progressMessage || "正在设计实验方案..."}</p>
    <p className="text-sm text-slate-400 mt-1">预计需要 30-60 秒</p>
  </div>
)}
```

- [ ] **Step 4: 验证**

```bash
npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/project/\[projectId\]/experiments/page.tsx
git commit -m "fix: consume SSE stream in experiment design page"
```

**🔴 CHECKPOINT:** 在浏览器中测试实验设计生成，确认：
1. 生成过程中显示进度消息（不再是空白等待）
2. 生成完成后正确显示实验设计卡片
3. 错误时正确显示错误提示

---

## Task 10: SSE 流式消费修复 — 排障诊断页面

**Files:**
- Modify: `app/(dashboard)/project/[projectId]/experiments/troubleshoot/page.tsx` (lines 28-38)

- [ ] **Step 1: 添加 consumeSSEStream import + 重写 handleSubmit**

与 Task 9 相同模式，将 `res.json()` 替换为 `consumeSSEStream()`：

```tsx
import { consumeSSEStream } from "@/lib/llm/streaming"
```

重写 `handleSubmit`：
```tsx
async function handleSubmit() {
  setIsLoading(true);
  setError(null);

  try {
    const res = await fetch("/api/experiments/troubleshoot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "诊断失败");
    }

    consumeSSEStream(res, {
      onProgress: (data) => {
        setProgressMessage(data.message || "正在分析...");
      },
      onResult: (data) => {
        setResult(data);
        setIsLoading(false);
      },
      onError: (message) => {
        setError(message);
        setIsLoading(false);
      },
      onDone: () => {
        setIsLoading(false);
      },
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "诊断失败");
    setIsLoading(false);
  }
}
```

需要添加 `progressMessage` 状态。

- [ ] **Step 2: 验证 + Commit**

```bash
npx tsc --noEmit
git add app/\(dashboard\)/project/\[projectId\]/experiments/troubleshoot/page.tsx
git commit -m "fix: consume SSE stream in troubleshoot page"
```

---

## Task 11: SSE 流式消费修复 — 论文组装页面

**Files:**
- Modify: `app/(dashboard)/project/[projectId]/manuscript/page.tsx` (lines 61-89, 198-216)

这个文件有 2 个 SSE 消费点：论文生成和审稿模拟。

- [ ] **Step 1: 添加 consumeSSEStream import**

```tsx
import { consumeSSEStream } from "@/lib/llm/streaming"
```

- [ ] **Step 2: 重写 handleGenerate（lines 61-89）**

将 `res.json()` 替换为 `consumeSSEStream()`，模式同 Task 9。

- [ ] **Step 3: 重写审稿模拟（lines 198-216）**

将 `res.json()` 替换为 `consumeSSEStream()`：

```tsx
consumeSSEStream(res, {
  onProgress: (data) => {
    setProgressMessage(data.message || "正在模拟审稿...");
  },
  onResult: (data) => {
    setReview(data);
    setIsReviewing(false);
  },
  onError: (message) => {
    setError(message);
    setIsReviewing(false);
  },
  onDone: () => {
    setIsReviewing(false);
  },
});
```

- [ ] **Step 4: 验证 + Commit**

```bash
npx tsc --noEmit
git add app/\(dashboard\)/project/\[projectId\]/manuscript/page.tsx
git commit -m "fix: consume SSE stream in manuscript page (generation + review)"
```

**🔴 CHECKPOINT:** 在浏览器中测试论文生成和审稿模拟，确认进度消息正确显示。

---

## Task 12: Zustand 状态统一 — 文献主页

**Files:**
- Modify: `app/(dashboard)/project/[projectId]/papers/page.tsx`

- [ ] **Step 1: 分析当前状态管理**

文献主页使用独立的 `useState<Paper[]>` + `useEffect` + `fetch()` 获取数据。需要改为使用 `useProjectStore`。

- [ ] **Step 2: 添加 Zustand store import**

```tsx
import { useProjectStore } from "@/store/project-store"
```

- [ ] **Step 3: 将 papers 状态迁移到 store**

将：
```tsx
const [papers, setPapers] = useState<Paper[]>([])
const [loading, setLoading] = useState(true)
```

改为从 store 获取：
```tsx
const { papers: storePapers, loadProject } = useProjectStore()
const [papers, setPapers] = useState<Paper[]>([])
const [loading, setLoading] = useState(true)
```

注意：由于 store 中的 `StoredPaper` 结构与 API 返回的 `Paper` 结构不同（store 有 `extractionStatus`，API 返回有 `extractions` 关联），可能需要保持本地 state 但添加同步逻辑。最简方案：保持 fetch 但删除/添加论文时同步更新 store。

- [ ] **Step 4: 确保删除和提取后数据同步**

在 `handleDelete` 和 `handleBatchDelete` 完成后，不仅更新本地 state，也调用 store 的 `removePaper()`。在 `handleExtract` 完成后，调用 store 的 `updatePaperExtraction()`。

- [ ] **Step 5: 验证 + Commit**

```bash
npx tsc --noEmit
git add app/\(dashboard\)/project/\[projectId\]/papers/page.tsx
git commit -m "refactor: sync papers page state with Zustand store"
```

**🔴 CHECKPOINT:** 在浏览器中：
1. 从搜索页添加论文 → 切换到文献主页 → 确认新论文可见
2. 在文献主页删除论文 → 切换到搜索页 → 确认论文标记已更新

---

## Task 13: PDF 解析库统一

**Files:**
- Modify: `app/api/projects/[projectId]/upload/route.ts`

- [ ] **Step 1: 替换 pdf-parse 为 pdf-parse-new**

将 import 从：
```tsx
import pdfParse from "pdf-parse"
```
替换为：
```tsx
import pdfParse from "pdf-parse-new"
```

- [ ] **Step 2: 验证**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/\[projectId\]/upload/route.ts
git commit -m "fix: unify PDF parsing library to pdf-parse-new"
```

---

## Task 14: 骨架屏集成到各页面

**Files:**
- Modify: `app/(dashboard)/page.tsx`
- Modify: `app/(dashboard)/project/[projectId]/papers/page.tsx`
- Modify: `app/(dashboard)/project/[projectId]/brain/page.tsx`
- Modify: `app/(dashboard)/project/[projectId]/timeline/page.tsx`
- Modify: `app/(dashboard)/project/[projectId]/experiments/page.tsx`
- Modify: `app/(dashboard)/project/[projectId]/data/page.tsx`
- Modify: `app/(dashboard)/project/[projectId]/manuscript/page.tsx`

- [ ] **Step 1: 项目列表页面集成骨架屏**

在 `app/(dashboard)/page.tsx` 中：

```tsx
import { DashboardSkeleton } from "@/components/skeletons"

// 将 loading 状态的 JSX 从：
if (loading) return <div className="p-8 text-center">加载中...</div>

// 替换为：
if (loading) return <div className="p-8"><DashboardSkeleton /></div>
```

- [ ] **Step 2: 文献管理页面集成骨架屏**

```tsx
import { PapersSkeleton } from "@/components/skeletons"

if (loading) return <div className="p-8"><PapersSkeleton /></div>
```

- [ ] **Step 3: 知识面板页面集成骨架屏**

```tsx
import { MatrixSkeleton } from "@/components/skeletons"

if (loading) return <div className="p-8"><MatrixSkeleton /></div>
```

- [ ] **Step 4: 时间线页面集成骨架屏**

```tsx
import { TimelineSkeleton } from "@/components/skeletons"

if (loading) return <div className="p-8"><TimelineSkeleton /></div>
```

- [ ] **Step 5: 实验页面集成骨架屏**

```tsx
import { ExperimentsSkeleton } from "@/components/skeletons"

if (loading) return <div className="p-8"><ExperimentsSkeleton /></div>
```

- [ ] **Step 6: 数据页面集成骨架屏**

```tsx
import { DataSkeleton } from "@/components/skeletons"

if (loading) return <div className="p-8"><DataSkeleton /></div>
```

- [ ] **Step 7: 论文组装页面集成骨架屏**

```tsx
import { ManuscriptSkeleton } from "@/components/skeletons"

if (loading) return <div className="p-8"><ManuscriptSkeleton /></div>
```

- [ ] **Step 8: TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: integrate skeleton loading states into all pages"
```

**🔴 CHECKPOINT:** 在浏览器中逐一访问每个页面，确认：
1. 加载时显示骨架屏（而非"加载中..."文本）
2. 骨架屏布局与实际内容布局相似
3. 数据加载完成后骨架屏消失，实际内容显示

---

## Task 15: 最终验收

- [ ] **Step 1: TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 2: alert/confirm 搜索验证**

```bash
grep -rn "alert(" --include="*.tsx" --include="*.ts" --exclude-dir=node_modules --exclude-dir=.next | grep -v "// " | grep -v "AlertDialog" | grep -v "alert-dialog"
```

Expected: 0 结果

```bash
grep -rn "confirm(" --include="*.tsx" --include="*.ts" --exclude-dir=node_modules --exclude-dir=.next | grep -v "// " | grep -v "AlertDialog"
```

Expected: 0 结果

- [ ] **Step 3: reload 搜索验证**

```bash
grep -rn "window.location.reload" --include="*.tsx" --include="*.ts" --exclude-dir=node_modules --exclude-dir=.next
```

Expected: 0 结果

- [ ] **Step 4: 时间线事件类型验证**

```bash
grep -rn "literature_search\|literature_extract\|hypothesis_formed\|experiment_designed\|manuscript_draft" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next
```

Expected: 0 结果（所有旧类型名已替换）

- [ ] **Step 5: SSE 消费验证**

```bash
grep -rn "res\.json()" --include="*.tsx" app/\(dashboard\)/project/\[projectId\]/experiments/ app/\(dashboard\)/project/\[projectId\]/manuscript/
```

Expected: 仅在 error handling 中出现（`await res.json().catch(() => ({}))`），不在正常流程中

- [ ] **Step 6: 全页面走查**

逐一打开以下页面，确认无 JS 错误、无布局异常：
1. `/` — 项目列表（骨架屏 → 内容）
2. `/project/[id]` — 项目详情
3. `/project/[id]/papers` — 文献管理（骨架屏 → 内容）
4. `/project/[id]/papers/search` — 文献搜索
5. `/project/[id]/brain` — 知识面板（骨架屏 → 内容）
6. `/project/[id]/timeline` — 时间线（骨架屏 → 内容，图标彩色）
7. `/project/[id]/experiments` — 实验设计（骨架屏 → 内容）
8. `/project/[id]/data` — 数据分析（骨架屏 → 内容）
9. `/project/[id]/manuscript` — 论文组装（骨架屏 → 内容）

- [ ] **Step 7: 最终 Commit**

```bash
git add -A
git commit -m "chore: Phase 1 complete — foundation engineering verified"
```

**🟢 PHASE 1 完成。** 所有地基工程已就位，可以进入 Phase 2（核心三模块）。
