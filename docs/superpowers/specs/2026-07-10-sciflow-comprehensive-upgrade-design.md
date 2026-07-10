# SciFlow AI 全面升级设计文档

> 日期：2026-07-10
> 策略：方案 A — 地基优先（自底向上）
> 原则：质量优先，不赶时间，给用户最优体验

---

## 一、背景与目标

### 当前问题诊断

SciFlow AI 已完成 Phase 0–5b 的全部功能开发，但存在以下系统性问题：

**基础设施缺陷：**
- 无 shadcn/ui 组件库（package.json 有依赖但未使用，所有 UI 为原生 Tailwind 手写）
- 全项目仅 1 个 shimmer CSS 动画，多数页面用纯文本"加载中..."
- 21 处 `alert()`/`confirm()` 原生弹窗
- 5 处 `window.location.reload()` 页面刷新
- 事件类型不匹配 bug（客户端 `literature_search` vs 服务端 `literature`，所有真实事件显示灰色默认图标）
- SSE 流式浪费（实验设计/排障/论文组装/数据分析 API 发送进度事件，前端用 `res.json()` 读取，进度从未显示）
- Zustand 与 API 状态割裂（文献主页直接 fetch，搜索页用 Zustand，数据不同步）
- hooks 目录为空，状态逻辑散落在组件内
- 无全局错误边界

**核心模块缺陷：**
- AI 助手：单体 705 行组件，被动聊天，工具结果不持久化，无消息重新生成/编辑，无文件上传
- 知识面板：机制矩阵只读原生 HTML table，假设不能创建/编辑/修改状态，Gap 列表无完成追踪
- 过程管理：ProcessAssistant 卡片与 ChatPanel 完全分离，无统一工作流引导

**支撑模块缺陷：**
- 文献：无论文详情页，无 BibTeX 导出，无分页，影响因子始终 null
- 实验：PDF 下载空壳，无实验结果记录，无 Protocol 编辑
- 数据：CSV 解析用 naive 逗号分割，不支持 Excel，只支持 bar/line 图表
- 论文：不能编辑生成文本，SSE 进度丢失，作者名硬编码
- 知识库：11/14 篇文章无内容
- 课程：0/26 节有内容

### 升级目标

1. **引入 shadcn/ui** 统一设计语言，替换所有手写组件
2. **全局骨架屏 + Toast + 微交互动画**，消除所有 alert()/reload()
3. **修复所有已知 bug**（事件类型、SSE 浪费、状态割裂等）
4. **AI 助手从被动聊天升级为主动型科研助手**
5. **知识面板从只读展示升级为交互式科研大脑**
6. **过程管理从分散卡片升级为统一工作流指挥中心**
7. **支撑模块全面 UX 重做 + 功能补齐**
8. **知识库 14 篇 + 课程 26 节内容全面填充**

---

## 二、Phase 1：地基工程

### 2.1 shadcn/ui 引入

**初始化：**
- 运行 `npx shadcn@latest init` 配置项目
- 配置 `components.json`，路径别名指向现有 `components/ui/`
- 确保与 Tailwind v4 兼容（shadcn/ui v2+ 支持）

**核心组件安装（按优先级）：**

| 组件 | 用途 | 替换目标 |
|------|------|----------|
| Button | 所有按钮 | 手写 button 样式 |
| Card | 卡片容器 | 手写 card div |
| Dialog / AlertDialog | 弹窗/确认 | alert() / confirm() |
| Toast / Sonner | 通知 | alert() |
| Skeleton | 加载占位 | "加载中..." 文本 |
| Tabs | 标签页 | 手写 tab 切换 |
| Badge | 标签 | 手写 span 标签 |
| Tooltip | 提示 | title 属性 |
| DropdownMenu | 下拉菜单 | 手写 dropdown |
| Sheet | 侧边抽屉 | ChatPanel / 移动端菜单 |
| Command | 命令面板 | 快捷搜索（未来） |
| Select | 下拉选择 | 手写 select |
| Input / Textarea | 输入框 | 手写 input |
| Progress | 进度条 | 手写 div 进度条 |
| Separator | 分割线 | 手写 hr/div |
| ScrollArea | 自定义滚动 | 原生 overflow |

**迁移策略：**
- 新代码直接使用 shadcn/ui 组件
- 旧代码按 Phase 分批迁移（Phase 1 迁移全局组件，Phase 2–3 迁移模块组件）
- 不做一次性全量替换，避免大规模回归

### 2.2 全局骨架屏系统

为每个模块创建专用骨架屏组件：

```
components/skeletons/
├── papers-skeleton.tsx        # 文献列表骨架屏
├── search-results-skeleton.tsx # 搜索结果骨架屏
├── matrix-skeleton.tsx        # 机制矩阵骨架屏
├── timeline-skeleton.tsx      # 时间线骨架屏
├── chat-skeleton.tsx          # 聊天历史骨架屏
├── data-skeleton.tsx          # 数据分析骨架屏
├── manuscript-skeleton.tsx    # 论文草稿骨架屏
├── experiments-skeleton.tsx   # 实验列表骨架屏
└── dashboard-skeleton.tsx     # 项目仪表盘骨架屏
```

每个骨架屏使用 shadcn `Skeleton` 组件，模拟真实内容的布局结构。

### 2.3 Toast 通知系统

使用 shadcn Sonner 组件，替换所有 `alert()`/`confirm()`：

| 当前代码 | 替换为 |
|----------|--------|
| `alert("操作成功")` | `toast.success("操作成功")` |
| `alert("操作失败: " + err)` | `toast.error("操作失败", { description: err })` |
| `confirm("确定删除?")` | `<AlertDialog>` 组件 |
| `alert("批量提取完成")` | `toast.success("批量提取完成", { description: "成功 N 篇，失败 M 篇" })` |

**影响文件：**
- `app/(dashboard)/page.tsx` — 项目 CRUD（4 处 alert/confirm）
- `app/(dashboard)/project/[projectId]/papers/page.tsx` — 批量操作（3 处）
- `components/papers/search-results.tsx` — PDF 下载/上传错误（2 处静默 catch → toast）
- `components/experiment/design-card.tsx` — 保存成功/失败
- `app/(dashboard)/project/[projectId]/data/page.tsx` — 分析错误

### 2.4 Bug 修复

**事件类型统一：**

客户端 `lib/timeline/events.ts` 的 `TimelineEventType` 与服务端 API 创建事件时使用的类型字符串不一致。

修复方案：统一为以下类型名（服务端为准，客户端适配）：

| 服务端 DB 值 | 客户端映射 | 图标 | 颜色 |
|-------------|-----------|------|------|
| `literature` | `literature` | 📖 BookOpen | blue |
| `hypothesis` | `hypothesis` | 💡 Lightbulb | amber |
| `experiment_design` | `experiment_design` | 🧪 FlaskConical | purple |
| `experiment_completed` | `experiment_completed` | ✅ CheckCircle | green |
| `experiment_failed` | `experiment_failed` | ⚠️ AlertTriangle | red |
| `manuscript` | `manuscript` | 📝 FileText | indigo |
| `data_upload` | `data_upload` | 📊 BarChart | teal |
| `matrix_updated` | `matrix_updated` | 🔍 GitBranch | purple |
| `pivot` | `pivot` | 🔀 Shuffle | orange |

同时补全缺失的事件创建：
- 搜索文献 → 创建 `literature` 事件（目前不创建）
- 数据上传/分析 → 创建 `data_upload` 事件（目前不创建）
- 实验完成/失败 → 创建对应事件（目前只有 `experiment_design`）

**SSE 流式修复：**

以下 4 个页面改为消费 SSE 流，显示真实进度：

1. `app/(dashboard)/project/[projectId]/experiments/page.tsx` — 实验设计生成
2. `app/(dashboard)/project/[projectId]/experiments/troubleshoot/page.tsx` — 排障诊断
3. `app/(dashboard)/project/[projectId]/manuscript/page.tsx` — 论文组装
4. `app/(dashboard)/project/[projectId]/data/page.tsx` — 数据分析

修复方式：使用 `lib/llm/streaming.ts` 的 `consumeSSEStream()` 替代 `await res.json()`。

**Zustand 状态统一：**

文献主页 `papers/page.tsx` 改用 `useProjectStore` 而非独立 `fetch()`。确保：
- 搜索页添加论文后，主页立即可见
- 主页删除论文后，搜索页不再显示"已纳入"标记
- 提取状态实时同步

**消除 window.location.reload()：**

| 文件 | 当前行为 | 修复方式 |
|------|----------|----------|
| `papers/page.tsx` PaperCard | 单篇提取后 reload | 更新 Zustand store，UI 自动刷新 |
| `papers/page.tsx` batchDelete | 批量删除后 reload | 从 store 移除，UI 自动刷新 |
| `papers/page.tsx` batchExtract | 批量提取后 re-fetch | 更新 store 中每篇的 extractionStatus |

**PDF 解析库统一：**

`upload/route.ts` 使用 `pdf-parse`，其余使用 `pdf-parse-new`。统一为 `pdf-parse-new`。

---

## 三、Phase 2：核心三模块

### 3.1 AI 助手全面重构

#### 3.1.1 组件架构拆分

当前 `components/chat/chat-panel.tsx`（705 行）拆分为：

```
components/chat/
├── chat-panel.tsx           # 容器组件（状态管理 + 布局）
├── message-list.tsx         # 消息列表 + 虚拟滚动
├── message-bubble.tsx       # 单条消息（用户/助手）
├── markdown-renderer.tsx    # Markdown 渲染（提取自 chat-panel）
├── tool-result-card.tsx     # 工具结果卡片（提取自 chat-panel）
├── chat-input.tsx           # 输入区 + 文件上传
├── conversation-manager.tsx # 多对话管理
├── proactive-insights.tsx   # 主动建议面板
└── chat-skeleton.tsx        # 聊天骨架屏
```

#### 3.1.2 消息管理增强

**重新生成：**
- 消息尾部添加"重新生成"按钮（仅对最后一条助手消息显示）
- 点击后删除最后一条助手消息，重新发送相同的用户消息
- API 端：复用现有 `/api/chat` 端点，客户端截断历史

**消息编辑：**
- 用户消息悬停显示"编辑"按钮
- 编辑后从该点创建新分支（保留原分支）
- 简化实现：编辑后截断后续消息，重新发送

**Token 用量显示：**
- 利用现有 `ChatMessage.metadata` JSON 字段（已定义但未使用）
- 服务端保存时写入 `{ model, inputTokens, outputTokens, toolsUsed }`
- 前端在消息底部显示小字：`claude-sonnet-5 · 1.2k tokens · 2 工具调用`

#### 3.1.3 文件上传

**聊天内 PDF 上传：**
- 输入区添加附件按钮 + 拖拽上传区域
- PDF 上传后解析文本，作为上下文注入对话
- API 端：在 `/api/chat` 中接收文件，解析后添加到系统上下文

**图片粘贴：**
- 支持 Ctrl+V 粘贴截图
- 图片转 base64，发送到 API（Anthropic 支持图片输入）
- 消息中显示图片预览

#### 3.1.4 工具结果持久化

当前问题：工具调用结果只在 SSE 流中传输，不保存到 DB。刷新页面后丢失。

修复方案：
- 服务端在保存 `ChatMessage` 时，将工具调用和结果作为 `metadata` 的一部分存储
- 前端加载历史消息时，从 metadata 恢复工具结果卡片
- `metadata` 结构：`{ tools: [{ name, input, output }], model, tokens }`

#### 3.1.5 多对话管理

当前：每个项目只有一个扁平对话。

升级为：
- `Conversation` 模型（Prisma）：id, projectId, userId, title, createdAt, updatedAt
- `ChatMessage` 添加 `conversationId` 字段
- 前端 `ConversationManager`：对话列表 + 新建 + 切换 + 重命名 + 删除
- 对话标题自动生成（取第一条用户消息前 30 字符）

#### 3.1.6 主动介入系统

**ProactiveInsights 组件：**
- 在聊天面板顶部显示（可折叠）
- 由工作流事件驱动（见 3.3 过程管理）
- 每条建议是一个可点击的卡片，点击后发送到聊天

**新增工具（扩展 chat-tools.ts）：**

| 工具名 | 功能 | 实现方式 |
|--------|------|----------|
| `create_experiment` | 从聊天中创建实验设计 | 调用 `designExperiment()` |
| `analyze_data` | 分析上传的数据 | 调用 `analyzeData()` |
| `edit_matrix_cell` | 编辑矩阵单元格 | Prisma 更新 MechanismMatrix |
| `update_hypothesis` | 更新假设状态 | Prisma 更新 Hypothesis |
| `search_knowledge` | 搜索知识库文章 | 匹配 ARTICLE_CONTENT |
| `get_workflow_status` | 获取工作流状态 | 聚合项目各模块数据 |

#### 3.1.7 动态快捷问题

当前：硬编码的快捷问题模板。

升级为：基于项目状态动态生成：
- 有矩阵冲突 → "帮我分析 NF-κB 通路的冲突原因"
- 有未提取文献 → "帮我提取最近添加的 3 篇文献"
- 有实验失败 → "帮我诊断实验失败的可能原因"
- 无数据 → "帮我搜索 sorafenib 联合治疗的最新文献"

### 3.2 知识面板（Brain）升级

#### 3.2.1 机制矩阵可编辑化

**TanStack Table 集成：**
- 替换原生 `<table>` 为 TanStack Table
- 启用：排序、列筛选、列宽调整、固定列（行条件列左侧固定）
- 使用 `@tanstack/react-table` v8（已安装）

**单元格内联编辑：**
- 点击数据单元格弹出内联编辑器（Popover）
- 可编辑字段：方向（↑/↓/— 三选一）、显著性（p<0.05/p<0.01/p<0.001/ns）、方法、备注
- 编辑后自动保存到 `MechanismMatrix.data` JSON 字段
- 编辑后触发冲突重新检测

**列操作：**
- 列拖拽排序：使用 `@dnd-kit/sortable`（需安装）
- 添加自定义维度列：点击 "+" 按钮，输入维度名称，列立即添加到矩阵
- 列头右键菜单：删除列、重命名、隐藏

**视觉增强：**
- 冲突单元格：红色脉冲边框动画（CSS `@keyframes`）
- 空单元格：虚线边框 + "+" 图标（提示可填充）
- 悬停行：高亮整行 + 显示来源论文名称
- 密度模式：紧凑/舒适/宽松（通过 TanStack Table 的 `size` 变体实现）

**导出增强：**
- PNG 导出：使用 `html-to-image` 库（需安装）
- SVG 导出：同上，format 参数改为 svg
- 保留现有 CSV 和 LaTeX 导出

#### 3.2.2 假设追踪器全功能化

**假设 CRUD：**
- 创建：Brain 页面添加"新建假设"按钮，弹出 Dialog 表单（shadcn Dialog）
- 编辑：假设卡片添加"编辑"按钮，弹出编辑 Dialog
- 删除：假设卡片添加"删除"按钮，AlertDialog 确认
- API：扩展现有 `/api/projects/[projectId]/hypotheses` 路由（添加 PATCH/DELETE）

**状态流转：**
- 假设卡片添加状态下拉菜单（shadcn DropdownMenu）
- 5 种状态：待验证 → 验证中 → 已支持 / 已否定 / 已修订
- 状态变更自动创建 TimelineEvent
- 状态变更自动触发 AI 助手通知

**证据关联：**
- 支持/反对证据支持关联到具体论文（通过 paperId）
- 支持关联到具体提取数据（通过 extractionId）
- 支持关联到实验结果（通过 experimentId）
- 点击证据可跳转到原始来源页面

**从矩阵冲突生成假设：**
- 冲突摘要区域添加"基于此冲突创建假设"按钮
- 自动填充假设声明模板："{pathway} 在 {condition} 中的作用方向存在争议"
- 自动填充支持/反对证据

**假设演化历史：**
- `Hypothesis` 模型添加 `version` 字段和 `parentId` 自引用
- 编辑假设时创建新版本，保留旧版本
- 假设卡片显示版本历史下拉

#### 3.2.3 Gap Finder → 任务板

**任务持久化：**
- 新增 `TodoItem` Prisma 模型：
  ```prisma
  model TodoItem {
    id          String   @id @default(cuid())
    projectId   String
    type        String   // "conflict" | "gap" | "suggestion" | "experiment_check"
    title       String
    detail      String?
    status      String   @default("pending") // "pending" | "completed"
    metadata    Json?    // 关联数据（conflictId, gapDimension 等）
    completedAt DateTime?
    createdAt   DateTime @default(now())
    project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  }
  ```

**任务板 UI：**
- 三列看板布局：冲突任务（amber）/ 数据缺口（blue）/ 建议任务（purple）
- 每个任务可勾选完成，完成状态持久化到 DB
- 已完成任务折叠显示，可展开查看历史
- 智能排序：冲突 > 缺口 > 建议，同类型内按严重度

**一键操作：**
- "设计实验验证" → 跳转 `/experiments` 并预填冲突上下文
- "提出假设" → 弹出假设创建 Dialog
- "搜索补充文献" → 跳转 `/papers/search` 并预填查询

**实验质量检查（从 demo 变为真实）：**
- 检查实验 protocol 中是否有阳性对照
- 检查样本量是否 ≥ 3（生物学重复）
- 检查是否有阴性对照
- 不合格项自动添加到任务板

### 3.3 过程管理整合

#### 3.3.1 工作流事件总线

新增 `lib/workflow/event-bus.ts`：

```typescript
type WorkflowEvent =
  | { type: 'papers_added'; count: number }
  | { type: 'extraction_completed'; paperId: string; title: string; pathways: string[] }
  | { type: 'conflict_detected'; pathway: string; description: string }
  | { type: 'hypothesis_created'; statement: string }
  | { type: 'experiment_saved'; name: string; hypothesisId?: string }
  | { type: 'experiment_failed'; name: string }
  | { type: 'data_uploaded'; fileName: string }
  | { type: 'project_idle'; days: number }
```

事件总线在客户端运行（Zustand middleware），当事件触发时：
1. 更新项目仪表盘状态
2. 生成 ProactiveInsight 推送到 AI 助手
3. 更新任务板（如适用）

#### 3.3.2 规则引擎升级

扩展现有 `lib/assistant/process-assistant.ts`：

| 触发事件 | 条件 | AI 助手推送 |
|----------|------|------------|
| extraction_completed | 提取到 ≥2 条通路效应 | "已从《{title}》提取 {N} 条通路数据" |
| conflict_detected | 新冲突 ≥1 | "{pathway} 存在方向冲突，建议设计实验验证" |
| data_uploaded | CSV/Excel 上传 | "检测到数据文件，建议用 {方法} 分析" |
| experiment_failed | 标记为 failed | "实验失败了，让我帮你分析原因" |
| hypothesis_created | 新假设 | "新假设已记录，建议用 {实验类型} 验证" |
| project_idle | 3 天无活动 | "项目有 {N} 个未解决的任务" |

#### 3.3.3 项目仪表盘

替换现有 `app/(dashboard)/project/[projectId]/page.tsx`：

**左侧主区：**
- 工作流进度条（6 步可视化，当前步骤高亮 + 脉冲动画）
- 关键指标卡片（文献数/提取数/冲突数/假设数/实验数）
- 最近动态时间线（从 TimelineEvent 查询，最多 10 条）

**右侧边栏：**
- "下一步建议"卡片（AI 基于项目状态生成，带优先级排序）
- 项目健康度圆环图 + 分项评分（文献覆盖/数据完整性/假设验证/实验设计）
- 快捷操作按钮

---

## 四、Phase 3：支撑模块

### 4.1 文献管理

#### Bug 修复
- `window.location.reload()` → 乐观 UI 更新（3 处）
- `alert()/confirm()` → Toast + AlertDialog（3 处）
- 静默 catch → toast.error（5 处）
- `pdf-parse` → `pdf-parse-new`（1 处）
- 影响因子 null → 移除排序选项或集成替代指标

#### UX 升级
- 骨架屏替换"加载中..."文本
- 搜索结果标记已有论文（灰色 + "已纳入" badge）
- 提取进度 SSE 流式更新（替换一次性返回）
- 论文卡片悬停预览（Popover 显示摘要 + 关键提取）

#### 新功能
- **论文详情页**：`app/(dashboard)/project/[projectId]/papers/[paperId]/page.tsx`
  - 全文阅读（如有 fullText）
  - 提取数据展示
  - 关联假设和实验
  - 编辑元数据

- **BibTeX/RIS 导出**：论文列表添加"导出引用"按钮
  - `lib/export.ts` 添加 `exportToBibtex()` 和 `exportToRis()`
  - 支持批量导出选中文献

- **相关论文推荐**：利用 Semantic Scholar 的 `getReferences()` 和 `getCitations()` API
  - 论文详情页显示"引用的论文"和"被引论文"
  - 可一键纳入项目

- **分页/虚拟滚动**：论文列表超过 50 篇时启用

- **批量 PDF 上传**：`PdfUploader` 组件集成到论文列表页面

### 4.2 实验模块

#### SSE 进度
- 实验设计页面：消费 SSE 流，显示"正在分析假设... → 正在设计 protocol... → 正在计算样本量..."
- 排障诊断页面：消费 SSE 流，显示"正在分析失败现象... → 正在检索文献... → 正在生成建议..."

#### 实验管理增强
- 实验列表页面：查看所有已保存实验，按状态筛选
- 实验状态流转：designed → running → completed/failed（下拉菜单切换）
- Protocol 编辑：生成后可手动修改步骤、试剂、时间点
- 关联假设：实验绑定到假设，完成时自动更新假设状态
- PDF 导出：Protocol 导出为可打印 PDF（使用 jsPDF 或 react-pdf）

#### 实验结果记录（新功能）
- 上传实验数据（CSV/Excel/图片）
- 记录实验结论和观察（富文本）
- 标记成功/失败 + 失败原因
- 关联到假设（支持/反对）
- 失败自动触发排障流程

#### 排障增强
- 历史诊断记录保存到 DB
- 从实验列表一键跳转排障
- 排障建议 → 一键应用到 Protocol（快速修复）

### 4.3 数据分析

#### 严重问题修复
- CSV 解析：使用 `papaparse` 库（需安装）替代 naive 逗号分割
- 图表类型：使用 Recharts 的 ScatterChart, BoxPlot（自定义组件）, HeatMap（自定义组件）
- 数据预览：格式化表格（shadcn Table），显示前 20 行
- 列变量：添加列选择器，用户指定分组列和测量列
- 拖拽上传：添加 `onDragOver`/`onDrop` 处理器

#### 新功能
- **Excel 支持**：使用 `xlsx`（SheetJS）库解析 .xlsx 文件
- **数据持久化**：分析结果保存到 `ExperimentData` 模型
- **分析历史**：查看过往分析记录，可重新查看结果
- **图表导出**：PNG/SVG 下载（html-to-image）
- **知识库联动**：推荐统计方法时链接到相关知识库文章
- **批量分析**：多文件/多 sheet 分析

### 4.4 论文组装

#### 生成增强
- SSE 流式：逐章节流式生成，实时显示文本
- Markdown 渲染：使用 ReactMarkdown 替换纯文本 `whitespace-pre-wrap`
- 内联编辑：生成后可直接修改文本（contentEditable 或 textarea 切换）
- 单章节重新生成：每个章节独立的"重新生成"按钮
- 版本历史：保存多版本草稿到 DB（`Manuscript` 模型的 `version` 字段）
- 持久化：生成的草稿自动保存到 DB（目前不保存）

#### 导出增强
- 期刊模板：添加期刊选择下拉，自动调整格式（字体、行距、引用格式）
- 作者信息：从 `UserSetting` 读取（非硬编码 "Author Name"）
- 引用管理：引用可点击 → 跳转论文详情页
- PDF 导出：使用 `@react-pdf/renderer` 或 `jsPDF` 替换 `window.print()`

#### 审稿人模拟增强
- SSE 流式生成
- severity 级别统一：Zod schema 添加 `"critical"` 选项（与 system prompt 一致）
- 审稿意见 → 一键跳转对应章节修改
- 审稿意见可逐条回复（记录修改说明）
- 修改后重新模拟审稿

### 4.5 全局 UI 统一

#### 加载状态
- 每个模块使用专用骨架屏（见 2.2）
- SSE 流式进度条（shadcn Progress）
- 按钮 loading 状态（shadcn Button 的 `disabled` + Spinner）
- 表格行级 loading（Skeleton 行）

#### 反馈系统
- Toast 通知（Sonner）：成功/错误/警告/信息
- AlertDialog 确认对话框
- 全局 ErrorBoundary（React Error Boundary）
- 空状态插图 + CTA 按钮
- 操作成功动画（CSS checkmark animation）

#### 微交互动画
- 卡片悬停 lift 效果（`translateY(-2px)` + shadow transition）
- 列表项进入/退出动画（Framer Motion 或 CSS transitions）
- 数字变化动画（count-up 效果）
- 进度条平滑过渡（`transition: width 0.5s ease`）
- 侧边栏折叠/展开动画（width transition）

---

## 五、Phase 4：内容工程

### 5.1 知识库内容

**14 篇文章，4 个分类：**

#### 统计学（5 篇）
1. P 值与统计显著性 ✅ 已有内容 + P 值模拟器
2. 统计功效与样本量 ✅ 已有内容
3. **效应量与 Cohen's d** 🆕 — 什么是效应量、为什么 P 值不够、Cohen's d 计算、实战解读
4. **多重比较校正** 🆕 — 多重比较问题、Bonferroni、FDR/BH 方法、何时用哪种
5. **统计报告规范** 🆕 — APA 格式、置信区间报告、图表标注规范

#### 实验设计（5 篇）
6. 实验对照设计 ✅ 已有内容
7. **盲法与随机化** 🆕 — 单盲/双盲/三盲、随机化方法、分配隐藏
8. **重复与再现性** 🆕 — 技术重复 vs 生物重复、独立重复、再现性危机
9. **剂量-反应关系设计** 🆕 — IC50/EC50 概念、梯度设计、曲线拟合
10. **IC50/EC50 测定方法** 🆕 — 实验设计、数据处理、GraphPad 实操

#### 常用实验方法（4 篇）
11. **Western Blot 全攻略** 🆕 — 样品制备、电泳、转膜、抗体孵育、常见问题
12. **qPCR 定量分析** 🆕 — 引物设计、内参选择、2^-ΔΔCt 方法、MIQE 规范
13. **流式细胞术** 🆕 — 原理、荧光选择、补偿、设门策略、数据分析
14. **ELISA 定量检测** 🆕 — 直接/间接/夹心 ELISA、标准曲线、数据分析

#### 论文写作（2 篇）
15. **科研图表设计规范** 🆕 — Figure 设计原则、颜色选择、字体大小、期刊要求
16. **SCI 论文写作结构** 🆕 — IMRAD 详解、各部分写作技巧、常见审稿意见

**文章统一模板：**
1. 概述（100 字，一句话说清楚）
2. 核心概念（800-1200 字，配公式/图示）
3. 实战案例（真实论文案例分析）
4. 常见误区（3-5 个踩坑点）
5. 快速检查清单（可打印）
6. 交互练习（模拟器/小测验，如适用）

**知识库 ↔ 数据模块联动：**
- 数据分析推荐 t-test → 显示"P 值"文章链接
- 数据分析推荐 ANOVA → 显示"多重比较"文章链接
- P 值模拟器从文章中独立为可复用组件
- 实验设计样本量计算 → 链接到"统计功效"文章

### 5.2 课程内容

**4 门课 26 节：**

#### 生物统计学实战（8 节）
1. 描述统计：均值、中位数、标准差
2. 假设检验：t 检验入门
3. 方差分析：ANOVA 与事后检验
4. 相关与回归分析
5. 非参数检验方法
6. 生存分析入门
7. 多重比较与校正
8. 综合实战：从数据到结论

#### 科研实验设计（6 节）
1. 假说驱动 vs 探索性研究
2. 实验变量与对照设计
3. 样本量与统计功效
4. 随机化与盲法
5. Protocol 撰写规范
6. 综合实战：设计一个完整实验

#### 细胞生物学实验（6 节）
1. 细胞培养基础
2. 细胞活力检测（MTT/CCK-8）
3. Western Blot 全流程
4. qPCR 与基因表达分析
5. 流式细胞术入门
6. 综合实战：药物敏感性实验

#### 科研论文写作（6 节）
1. IMRAD 结构与写作逻辑
2. 摘要与标题的打磨
3. 结果部分：数据讲故事
4. 讨论部分：从结果到意义
5. 引用管理与参考文献
6. 投稿与回复审稿意见

**每节课结构：**
- 学习目标（3 个要点）
- 核心讲解（图文 + 公式）
- 实例演示（真实案例）
- 交互练习（小测验）
- 知识卡片（可下载 PDF）
- 延伸阅读（链接知识库文章）

**进度追踪系统：**
- 新增 `CourseProgress` Prisma 模型：
  ```prisma
  model CourseProgress {
    id        String   @id @default(cuid())
    userId    String
    courseId   String
    lessonId  String
    status    String   @default("not_started") // "not_started" | "in_progress" | "completed"
    startedAt DateTime?
    completedAt DateTime?
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@unique([userId, courseId, lessonId])
  }
  ```
- 课程页面显示进度百分比
- 学习时间统计
- 完成徽章

---

## 六、技术决策

### 6.1 新增依赖

| 包 | 用途 | Phase |
|----|------|-------|
| shadcn/ui | 组件库 | 1 |
| @dnd-kit/core + @dnd-kit/sortable | 拖拽排序 | 2 |
| html-to-image | 矩阵 PNG/SVG 导出 | 2 |
| papaparse | CSV 解析 | 3 |
| xlsx (SheetJS) | Excel 解析 | 3 |
| framer-motion | 微交互动画 | 3 |
| @react-pdf/renderer | PDF 生成 | 3 |

### 6.2 Prisma Schema 变更

**新增模型：**
- `Conversation` — 对话管理
- `TodoItem` — 任务板持久化
- `CourseProgress` — 课程进度追踪

**修改模型：**
- `ChatMessage` — 添加 `conversationId` 字段
- `Hypothesis` — 添加 `version` 和 `parentId` 字段
- `Experiment` — 添加 `result` JSON 字段扩展（支持实验结果记录）

### 6.3 不做的事（YAGNI）

- 不做实时协作（多人同时编辑矩阵）—— 单用户场景
- 不做移动端 App —— 响应式 Web 足够
- 不做离线模式 —— 科研工具强依赖网络
- 不做 i18n —— 当前用户群中文为主
- 不做暗色模式 —— 优先级低，后续可加
- 不做 JCR 影响因子集成 —— 数据来源受限，先移除排序选项

---

## 七、验收标准

### Phase 1 验收
- [ ] `npx tsc --noEmit` 零错误
- [ ] 全项目搜索 `alert(` 和 `confirm(` 结果为 0
- [ ] 全项目搜索 `window.location.reload` 结果为 0
- [ ] 时间线事件图标正确显示（非灰色默认）
- [ ] 实验设计/排障页面显示 SSE 进度
- [ ] 所有页面有骨架屏加载状态

### Phase 2 验收
- [ ] AI 助手可重新生成/编辑消息
- [ ] AI 助手可上传 PDF 文件
- [ ] 工具结果刷新后不丢失
- [ ] 矩阵单元格可内联编辑
- [ ] 假设可在 Brain 页面创建/编辑/修改状态/删除
- [ ] 任务板任务可勾选完成，状态持久化
- [ ] 项目仪表盘显示下一步建议和健康度

### Phase 3 验收
- [ ] 论文详情页可访问
- [ ] BibTeX 导出功能可用
- [ ] 数据分析支持 Excel 文件
- [ ] 数据分析支持 box/scatter 图表
- [ ] 论文组装支持内联编辑
- [ ] 论文 PDF 导出不使用 window.print()

### Phase 4 验收
- [ ] 知识库 14/14 篇文章有内容
- [ ] 课程 26/26 节有内容
- [ ] 课程进度可追踪
- [ ] 知识库文章可从数据分析模块链接跳转

---

## 八、Phase 依赖关系

```
Phase 1（地基）──→ Phase 2（核心）──→ Phase 3（支撑）──→ Phase 4（内容）
    │                   │                   │                   │
    ├─ shadcn/ui        ├─ 用 shadcn/ui     ├─ 用 shadcn/ui     ├─ 用 shadcn/ui
    ├─ 骨架屏           ├─ AI 骨架屏         ├─ 各模块骨架屏      ├─ 课程骨架屏
    ├─ Toast            ├─ 用 Toast          ├─ 用 Toast          │
    ├─ 事件类型修复      ├─ EventBus          ├─ 用 EventBus      │
    ├─ SSE 修复         ├─ 用 SSE            ├─ 用 SSE            │
    └─ Zustand 统一     ├─ 用 Zustand        ├─ 用 Zustand        │
                        ├─ Prisma 迁移       │                    │
                        │  (Conversation,    ├─ 用 Conversation   │
                        │   TodoItem)        ├─ 用 TodoItem       │
                        │                    │                    ├─ Prisma 迁移
                        │                    │                    │  (CourseProgress)
                        │                    │                    └─ 知识库↔数据联动
                        └────────────────────┘
```

**关键依赖：**
- Phase 2 依赖 Phase 1 的 shadcn/ui + Toast + 事件类型修复 + Zustand 统一
- Phase 3 依赖 Phase 1 的骨架屏 + Toast + SSE 修复，部分依赖 Phase 2 的 EventBus 和 Prisma 模型
- Phase 4 依赖 Phase 3 的知识库联动设计，以及 Phase 2 的 Prisma 模型（CourseProgress）
- 每个 Phase 内部的任务可以并行（不同模块之间无依赖）

---

## 九、测试策略

### 每个 Phase 的验证方式

| Phase | 验证方式 |
|-------|----------|
| Phase 1 | `npx tsc --noEmit` + 全文搜索验证（alert/reload 为 0）+ 手动走查每个页面的骨架屏和 Toast |
| Phase 2 | Playwright E2E 测试核心流程（AI 聊天→工具调用→结果持久化、矩阵编辑、假设 CRUD、任务板勾选） |
| Phase 3 | 每个模块的功能测试（上传 Excel、导出 BibTeX、编辑论文、PDF 生成） |
| Phase 4 | 内容完整性检查（14 篇 + 26 节）+ 知识库链接跳转测试 |

### 回归防护

- Phase 1 完成后运行 `npx tsc --noEmit` 确保零编译错误
- 每个 Phase 完成后手动走查所有页面，确保无 UI 回归
- Prisma schema 变更后运行 `npx prisma migrate dev` 验证迁移
- shadcn/ui 迁移时逐组件替换，每替换一个组件后验证该页面

---

## 十、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| shadcn/ui 与 Tailwind v4 兼容性 | Phase 1 阻塞 | shadcn/ui v2+ 已支持 Tailwind v4，先在独立分支验证 |
| 矩阵编辑性能（大矩阵 100+ 行） | Phase 2 用户体验 | TanStack Table 虚拟滚动 + 分页 |
| LLM 预生成内容质量 | Phase 4 内容可用性 | 人工审核每篇文章，迭代修正 |
| Prisma 迁移破坏现有数据 | 全局 | 先在开发环境测试迁移，备份生产数据 |
| SSE 流式在某些浏览器不兼容 | Phase 1-3 | 使用 EventSource polyfill，降级为轮询 |

---

## 十一、不做的事（YAGNI）

已列在 6.3 节。补充：
- 不做实时协作（多人同时编辑矩阵）
- 不做移动端 App
- 不做离线模式
- 不做 i18n
- 不做暗色模式
- 不做 JCR 影响因子集成
- 不做语音输入
- 不做 AI 对话的 image generation
- 不做自动文献推荐（基于阅读历史的协同过滤）
