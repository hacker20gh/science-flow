# SciFlow AI Phase 2：核心三模块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 助手从被动聊天升级为主动型科研助手，将知识面板从只读展示升级为交互式科研大脑，将过程管理从分散卡片升级为统一工作流指挥中心。

**Architecture:** AI 助手拆分为 9 个子组件 + 自定义 hooks，新增 6 个工具。知识面板引入 TanStack Table 交互式矩阵 + 假设 CRUD API + 持久化任务板。过程管理通过 EventBus 连接 AI 助手和项目仪表盘。

**Tech Stack:** shadcn/ui (Phase 1 已就位), Zustand, Prisma, TanStack Table, @dnd-kit, Sonner, React

**Prerequisites:** Phase 1 完成（shadcn/ui + 骨架屏 + Toast + Bug 修复）

**Spec:** `docs/superpowers/specs/2026-07-10-sciflow-comprehensive-upgrade-design.md` 第三章

---

## Task 1: Prisma Schema 迁移 — 新增模型

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 添加 Conversation 模型**

```prisma
model Conversation {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  title     String   @default("新对话")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  ChatMessage[]
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([projectId, userId])
  @@index([userId])
}
```

- [ ] **Step 2: 修改 ChatMessage 模型**

添加 `conversationId` 字段：
```prisma
model ChatMessage {
  id             String       @id @default(cuid())
  projectId      String
  userId         String
  conversationId String?
  role           String       // user, assistant, system
  content        String
  metadata       Json?
  createdAt      DateTime     @default(now())
  project        Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  conversation   Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  @@index([projectId, createdAt])
  @@index([userId])
  @@index([conversationId])
}
```

- [ ] **Step 3: 添加 TodoItem 模型**

```prisma
model TodoItem {
  id          String    @id @default(cuid())
  projectId   String
  type        String    // conflict | gap | suggestion | experiment_check
  title       String
  detail      String?
  status      String    @default("pending") // pending | completed
  metadata    Json?
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, status])
}
```

- [ ] **Step 4: 运行迁移**

```bash
npx prisma migrate dev --name add-conversation-todoitem
```

- [ ] **Step 5: 验证**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: add Conversation and TodoItem Prisma models"
```

**🔴 CHECKPOINT:** `npx prisma migrate dev` 成功，`npx tsc --noEmit` 零错误。

---

## Task 2: AI 助手组件拆分 — 提取子组件

**Files:**
- Modify: `components/chat/chat-panel.tsx`
- Create: `components/chat/chat-header.tsx`
- Create: `components/chat/message-list.tsx`
- Create: `components/chat/message-bubble.tsx`
- Create: `components/chat/tool-result-card.tsx`
- Create: `components/chat/markdown-renderer.tsx`
- Create: `components/chat/chat-input.tsx`
- Create: `components/chat/quick-questions.tsx`
- Create: `lib/chat/chat-utils.ts`

- [ ] **Step 1: 提取纯工具函数到 `lib/chat/chat-utils.ts`**

从 `chat-panel.tsx` 中提取以下函数（它们不依赖组件状态）：
- `formatTime(timestamp)` — 相对时间显示
- `copyMessage(content)` — 复制到剪贴板
- `exportChat(messages, projectName)` — 导出为 Markdown
- `highlightMatch(text, query)` — 搜索高亮
- `getQuickQuestions(projectContext)` — 快捷问题生成
- `TOOL_LABELS` 常量 — 工具名称到中文标签的映射

- [ ] **Step 2: 提取 `ToolResultCard` 到独立文件**

将 `chat-panel.tsx` 中的 `ToolResultCard` 函数组件（约 50 行）提取到 `components/chat/tool-result-card.tsx`。

- [ ] **Step 3: 提取 `MarkdownMessage` 到独立文件**

将 `chat-panel.tsx` 中的 `MarkdownMessage` 函数组件（约 70 行）提取到 `components/chat/markdown-renderer.tsx`。

- [ ] **Step 4: 提取 `ChatHeader` 组件**

头部栏（标题、消息计数、搜索/导出/清空/全屏/关闭按钮）。Props: `messages`, `showSearch`, `isFullscreen`, `projectContext`, 回调函数。

- [ ] **Step 5: 提取 `ChatInput` 组件**

输入区（自动调整高度的 textarea + 发送/停止按钮）。Props: `input`, `isStreaming`, `onInputChange`, `onSend`, `onStop`。管理自动调整高度逻辑。

- [ ] **Step 6: 提取 `MessageBubble` 组件**

单条消息气泡。Props: `message`, `isLastAssistant`, `isStreaming`, `searchQuery`。

- [ ] **Step 7: 提取 `MessageList` 组件**

可滚动的消息列表。Props: `messages`, `isStreaming`, `isLoadingHistory`, `toolStatus`, `projectContext`, `searchQuery`。

- [ ] **Step 8: 提取 `QuickQuestions` 组件**

空状态下的快捷问题按钮。

- [ ] **Step 9: 重构 `ChatPanel` 为容器组件**

`chat-panel.tsx` 只保留状态管理和布局，所有渲染委托给子组件。目标：从 705 行降到 ~200 行。

- [ ] **Step 10: 验证**

```bash
npx tsc --noEmit
```

- [ ] **Step 11: Commit**

```bash
git add components/chat/ lib/chat/
git commit -m "refactor: split ChatPanel into 7 sub-components + chat-utils"
```

**🔴 CHECKPOINT:** AI 聊天面板功能与之前完全一致（回归测试），但代码从 1 个文件变成 9 个文件。

---

## Task 3: 对话管理 API

**Files:**
- Create: `app/api/projects/[projectId]/conversations/route.ts`
- Create: `app/api/projects/[projectId]/conversations/[conversationId]/route.ts`

- [ ] **Step 1: 创建对话列表 API**

```typescript
// app/api/projects/[projectId]/conversations/route.ts
// GET: 列出项目的所有对话
// POST: 创建新对话
```

- [ ] **Step 2: 创建对话详情 API**

```typescript
// app/api/projects/[projectId]/conversations/[conversationId]/route.ts
// GET: 获取对话及其消息
// PATCH: 更新对话（重命名）
// DELETE: 删除对话及其消息
```

- [ ] **Step 3: 验证 + Commit**

```bash
npx tsc --noEmit
git add app/api/projects/\[projectId\]/conversations/
git commit -m "feat: add conversation CRUD API routes"
```

---

## Task 4: 工具结果持久化 + 新工具

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `lib/llm/chat-tools.ts`

- [ ] **Step 1: 工具结果持久化**

修改 `chat/route.ts` 的 `saveMessages` 函数，将工具调用和结果保存到 `ChatMessage.metadata`：
```typescript
metadata: {
  tools: [{ name, input, output }],
  model: modelName,
  inputTokens, outputTokens
}
```

- [ ] **Step 2: 添加新工具到 `chat-tools.ts`**

新增 4 个工具：
- `update_hypothesis` — 更新假设状态
- `edit_matrix_cell` — 编辑矩阵单元格
- `search_knowledge` — 搜索知识库文章
- `get_workflow_status` — 获取工作流状态

- [ ] **Step 3: 验证 + Commit**

---

## Task 5: 假设 CRUD API 扩展

**Files:**
- Modify: `app/api/projects/[projectId]/hypotheses/route.ts`

- [ ] **Step 1: 添加 PATCH 端点**

```typescript
// PATCH: 更新假设（状态、声明、证据）
// Body: { id, status?, statement?, evidence?, basedOn? }
```

- [ ] **Step 2: 添加 DELETE 端点**

```typescript
// DELETE: 删除假设
// Body: { id }
// 或 Query: ?id=xxx
```

- [ ] **Step 3: 验证 + Commit**

```bash
npx tsc --noEmit
git add app/api/projects/\[projectId\]/hypotheses/route.ts
git commit -m "feat: add PATCH/DELETE to hypotheses API"
```

---

## Task 6: TodoItem API

**Files:**
- Create: `app/api/projects/[projectId]/todos/route.ts`

- [ ] **Step 1: 创建 TodoItem CRUD API**

```typescript
// GET: 列出项目的任务（按状态筛选）
// POST: 创建任务
// PATCH: 更新任务（标记完成）
// DELETE: 删除任务
```

- [ ] **Step 2: 验证 + Commit**

---

## Task 7: 知识面板 — 假设 CRUD UI

**Files:**
- Create: `components/brain/hypothesis-card.tsx`
- Create: `components/brain/hypothesis-form.tsx`
- Create: `components/brain/hypothesis-status-badge.tsx`
- Modify: `app/(dashboard)/project/[projectId]/brain/page.tsx`

- [ ] **Step 1: 创建 `HypothesisStatusBadge` 组件**

5 种状态的徽章：待验证/验证中/已支持/已否定/已修订，使用 shadcn Badge。

- [ ] **Step 2: 创建 `HypothesisForm` 组件**

shadcn Dialog 表单，用于创建和编辑假设。字段：声明、状态、支持证据、反对证据、基于来源。

- [ ] **Step 3: 创建 `HypothesisCard` 组件**

从 brain/page.tsx 提取假设卡片渲染逻辑。添加：
- 状态下拉菜单（DropdownMenu）
- 编辑按钮（打开 HypothesisForm）
- 删除按钮（AlertDialog 确认）
- 证据关联到论文/实验

- [ ] **Step 4: 集成到 Brain 页面**

添加"新建假设"按钮，替换现有假设渲染为 `<HypothesisCard>`。

- [ ] **Step 5: 验证 + Commit**

**🔴 CHECKPOINT:** 在浏览器中测试假设的创建、编辑、状态修改、删除全流程。

---

## Task 8: 知识面板 — 矩阵可编辑化

**Files:**
- Modify: `components/matrix/mechanism-matrix.tsx`
- Create: `components/matrix/cell-editor.tsx`
- Create: `app/api/projects/[projectId]/matrix/cells/route.ts`

- [ ] **Step 1: 创建单元格编辑器组件 `CellEditor`**

Popover 编辑器，可编辑：方向（↑/↓/—）、显著性、方法、备注。

- [ ] **Step 2: 创建单元格编辑 API**

```typescript
// PATCH: 更新矩阵中某个单元格
// Body: { rowId, columnId, direction?, significance?, method?, note? }
// 保存后触发冲突重新检测
```

- [ ] **Step 3: 在 MechanismMatrix 中集成 CellEditor**

点击数据单元格 → 打开 CellEditor → 保存 → 更新矩阵。

- [ ] **Step 4: 验证 + Commit**

**🔴 CHECKPOINT:** 点击矩阵单元格可编辑，编辑后矩阵自动更新。

---

## Task 9: 知识面板 — 任务板

**Files:**
- Create: `components/brain/task-board.tsx`
- Modify: `app/(dashboard)/project/[projectId]/brain/page.tsx`

- [ ] **Step 1: 创建 `TaskBoard` 组件**

三列看板布局（冲突/缺口/建议），任务可勾选完成。

- [ ] **Step 2: 集成到 Brain 页面**

替换现有 TodoList 为 `<TaskBoard>`，数据从 `/api/projects/${projectId}/todos` 获取。

- [ ] **Step 3: 验证 + Commit**

---

## Task 10: 工作流引擎 + 项目仪表盘

**Files:**
- Create: `lib/workflow/event-bus.ts`
- Create: `lib/workflow/rules.ts`
- Modify: `app/(dashboard)/project/[projectId]/page.tsx`

- [ ] **Step 1: 创建 EventBus**

客户端事件总线（Zustand middleware），支持 `emit` 和 `subscribe`。

- [ ] **Step 2: 创建规则引擎**

基于事件生成 ProactiveInsight 推送到 AI 助手。

- [ ] **Step 3: 重构项目仪表盘**

替换现有 Overview 页为新设计：工作流进度 + 指标卡片 + 最近动态 + 下一步建议 + 健康度。

- [ ] **Step 4: 验证 + Commit**

---

## Task 11: 最终验收

- [ ] **Step 1: TypeScript 编译**
- [ ] **Step 2: AI 助手功能回归测试**
- [ ] **Step 3: 知识面板交互测试**
- [ ] **Step 4: 项目仪表盘测试**
- [ ] **Step 5: Commit + 标记 Phase 2 完成**
