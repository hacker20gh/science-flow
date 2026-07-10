# SciFlow AI — 项目开发指南

## 项目概述

SciFlow AI 是一个 AI 驱动的科研全流程工作流网站，覆盖从文献调研到实验设计到论文发表的完整链路。

**核心理念**：不是三个独立工具，而是一条有记忆的循环式工作流——每个阶段的输出自动成为下一个阶段的输入，失败和回溯都是流程的正常组成部分。

**一句话定位**：SciFlow 是一个陪你螺旋上升的科研伙伴。每一圈回来，它都比上一圈更懂你的课题。

---

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 框架 | Next.js 15 (App Router) | 全栈框架，前端 + API Routes |
| 语言 | TypeScript | 严格模式 |
| UI | Tailwind CSS + shadcn/ui | 样式 + 组件库 |
| 表格 | TanStack Table | 机制矩阵等复杂表格 |
| 状态 | Zustand（客户端）+ TanStack Query（服务端） | 状态管理 |
| 数据库 | PostgreSQL (Supabase) | 结构化数据 + Auth + Storage |
| ORM | Prisma | 数据库访问 |
| LLM | 通过 CCS 网关（OpenAI 兼容格式） | 不直接对接模型供应商 |
| 部署 | Vercel + Supabase | 前端 + 后端 |

---

## LLM 接入方式

**不直接对接任何模型供应商**，统一通过 CCS（ccswitch）代理网关：

```
SciFlow AI → CCS（OpenAI 兼容格式）→ Claude / DeepSeek / GPT / Qwen
```

- 客户端使用 `openai` SDK，`baseURL` 指向 CCS
- 模型名通过 `.env` 配置（`CCS_MODEL_CHAT`、`CCS_MODEL_EXTRACTION`、`CCS_MODEL_ANALYSIS`）
- 换模型只改 `.env`，代码零改动
- 详见 `SciFlow_AI_Claude_API_接入方案.md`

---

## 项目结构

```
app/
├── (auth)/                   # 认证页面
├── (dashboard)/              # 已登录用户区域
│   ├── layout.tsx            # 侧边栏 + 主内容布局
│   ├── page.tsx              # 项目列表
│   └── project/[projectId]/  # 项目主页面
│       ├── page.tsx          # 时间线/知识面板/草稿 Tab
│       ├── timeline/         # 时间线视图
│       ├── brain/            # 知识面板（机制矩阵）
│       ├── experiments/      # 实验管理
│       ├── papers/           # 文献管理
│       ├── data/             # 数据上传与分析
│       └── manuscript/       # 论文组装
├── knowledge/                # 科研知识库
├── courses/                  # 科研设计实战课
├── api/                      # API Routes
└── layout.tsx

components/
├── ui/                       # shadcn/ui 基础组件
├── matrix/                   # 机制矩阵组件
├── timeline/                 # 时间线组件
├── experiment/               # 实验设计组件
├── chat/                     # AI 对话组件
├── knowledge/                # 知识库组件
├── courses/                  # 设计课组件
└── manuscript/               # 论文组装组件

lib/
├── llm/                      # LLM 调用层（通过 CCS）
│   ├── client.ts             # OpenAI 客户端初始化
│   └── prompts/              # Prompt 模板
├── db.ts                     # Prisma 客户端
├── academic/                 # 学术 API（PubMed, Semantic Scholar, OpenAlex）
├── analysis/                 # 统计分析 + 图表生成
└── utils/                    # 工具函数
```

---

## 核心功能模块

### 1. 知识面板（Brain）— 课题的"大脑"

由 3 个联动模块组成：
- **机制矩阵**：多文献 + 实验数据的结构化对比表格
- **假设追踪器**：当前假设 + 支持/反对证据 + 强度百分比
- **待办清单**：缺什么实验/对照/数据，可一键补全

每次加文献/做实验/上传数据，三个模块同时更新。

### 2. 时间线（Timeline）

记录项目所有事件，包括失败和转向。7 种事件类型：
- 📖 文献添加、💡 假设提出、🧪 实验设计
- ⚠️ 实验失败、✅ 实验成功、🔀 方向转变、📝 写作

### 3. 过程助手（Process Assistant）

知识库深度融入工作流的"实时教练"。在关键决策点自动介入：
- 样本量不足 → 计算统计功效
- 缺少对照组 → 列出缺失 + 一键补全
- 浓度超出安全范围 → 对比文献 + 建议调整
- 统计方法选择 → 根据数据特征推荐

### 4. 循环式工作流

```
探索 ←→ 验证 ←→ 输出
```

三个阶段可任意回溯，每圈积累知识。失败是一等公民。

---

## 开发规范

### 代码风格

- 使用 TypeScript 严格模式
- 组件用函数式组件 + hooks
- 服务端组件优先，需要交互时才加 `"use client"`
- 错误处理：每个 API 调用加 try/catch，用户可见的错误用 toast 提示

### UI 设计原则

- 遵循 shadcn/ui 的设计规范（Radix + Tailwind）
- 参考 `.claude/skills/ui-ux-pro-max/` 中的设计规则
- 科研工具风格：蓝绿系配色、高对比度、信息密度适中
- 三栏布局：左侧导航 + 中间主区 + 右侧 AI 助手

### LLM 调用规范

- 简单提取用便宜模型（`CCS_MODEL_EXTRACTION`）
- 对话用平衡模型（`CCS_MODEL_CHAT`）
- 深度分析用最强模型（`CCS_MODEL_ANALYSIS`）
- 每个提取结果必须附带原文引用（`evidence_quote`）
- 使用 Structured Output（Zod Schema）保证返回格式正确
- 统一错误处理：限流重试、服务端错误降级

### 数据库规范

- 使用 Prisma schema 定义模型
- 关联关系用 `@relation` 明确声明
- 时间字段用 `DateTime @default(now())`
- 软删除用 `archivedAt` 字段

---

## 设计文档索引

| 文档 | 内容 |
|------|------|
| `SciFlow_AI_产品设计讨论纪要.md` | 产品定位、板块评估、循环式工作流、落地路线图 |
| `SciFlow_AI_交互设计与技术方案.md` | 11 个交互设计模块 + 完整技术方案（数据库 Schema、API 设计、目录结构） |
| `SciFlow_AI_Claude_API_接入方案.md` | LLM 接入方案（CCS 网关、OpenAI 兼容格式、模型分级策略） |

**开发前先读这三个文档。**

---

## 关键设计决策

1. **循环式工作流**，不是线性管线——真实科研充满失败和回溯
2. **失败是一等公民**——记录失败比记录成功更重要
3. **CCS 网关接入 LLM**——不绑死任何供应商，换模型零代码改动
4. **机制矩阵是核心差异化**——"比较十篇"比"读懂一篇"更有价值
5. **过程助手嵌入工作流**——不是被动查阅的 Wiki，是主动介入的教练
6. **项目为中心**——不是"选工具用"，是"创建课题，系统跟着走"

---

## 开发阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | Next.js 项目初始化 + Supabase + Auth + 基础布局 | ✅ |
| Phase 1a | 文献搜索（PubMed + Semantic Scholar） | ✅ |
| Phase 1b | 信息提取（LLM + Structured Output + PDF 全文） | ✅ |
| Phase 1c | 机制矩阵（冲突检测 + Gap Finder） | ✅ |
| Phase 2a | 实验设计向导 + Protocol 生成 | ✅ |
| Phase 2b | 排障诊断 | ✅ |
| Phase 3a | 数据上传 + 统计分析 + 图表 | ✅ |
| Phase 3b | 论文组装 + LaTeX/Word 导出 + 审稿人模拟 | ✅ |
| Phase 4 | AI 助手对话面板（SSE 流式 + Tool Use） | ✅ |
| Phase 5a | 科研知识库 + P 值交互模拟器 | ✅ |
| Phase 5b | 科研设计实战课 + 项目健康度检查 | ✅ |
| E2E 验证 | MIMO 兼容 + PDF 全文提取 + 工作流全链路 | ✅ |
