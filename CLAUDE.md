# SciFlow AI — 项目开发指南

## 项目概述

SciFlow AI 是一个 AI 驱动的科研全流程工作流网站，覆盖从文献调研到实验设计到论文发表的完整链路。

**核心理念**：不是三个独立工具，而是一条有记忆的循环式工作流——每个阶段的输出自动成为下一个阶段的输入，失败和回溯都是流程的正常组成部分。

**一句话定位**：SciFlow 是一个陪你螺旋上升的科研伙伴。每一圈回来，它都比上一圈更懂你的课题。

---

## 会话启动（每次新对话自动执行）

每次新对话开始时，**先执行以下检查**，再处理用户请求：

### 1. Daily Triage（每天一次）

读取 `STATE.md` 的 `Last run` 字段：
- 如果是 `never` 或距今 **超过 24 小时** → 执行 Daily Triage：
  1. 读取 `loop-constraints.md` 确认红线
  2. 运行 `npx tsc --noEmit` 检查 TypeScript 编译
  3. 搜索 TODO/FIXME/HACK 标记（排除 node_modules、.next）
  4. 运行 `git status --short` 检查未提交文件
  5. 将结果写入 `STATE.md`（更新 Last run 时间 + High Priority + Watch List）
  6. 在 `loop-run-log.md` 追加一行记录
  7. 如果发现 🔴 High 优先级问题，**在回复用户之前先报告**
- 如果距今 **不足 24 小时** → 跳过，直接处理用户请求

### 2. 约束遵守

每次涉及代码修改时，先检查 `loop-constraints.md` 的 denylist 路径。违反约束 = 立即停止 + 告知用户。

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
| 部署 | Vercel | 自动部署 + CDN + Serverless |
| 监控 | Sentry | 错误监控 + 性能追踪 |
| 分析 | PostHog | 产品分析 + 用户行为追踪 |
| 邮件 | Resend | 事务性邮件 |
| CI/CD | GitHub Actions | 自动化检查 + 构建 |

---

## MCP 工具配置（2026-07-22 更新）

### 浏览器自动化工具栈

SciFlow 项目配置了 4 个浏览器自动化 MCP 工具，针对不同场景优化：

#### 核心工具（已验证可用）

| 工具 | 开发商 | 核心优势 | 推荐场景 | 状态 |
|------|--------|---------|---------|------|
| **playwright** | Microsoft | 功能全面、多浏览器支持 | **日常 UI 验证首选** | ✅ 可用 |
| **firecrawl** | Mendable | 专业网页抓取、结构化数据 | **网页搜索 + 数据抓取** | ✅ 可用 |
| **chrome-devtools** | Google | 50+调试工具、Lighthouse | **性能优化 + 深度调试** | ✅ 可用 |
| **stagehand-local** | Browserbase | AI 代理、自然语言操作 | **AI 驱动浏览器操作** | ✅ 可用 |

---

### 工具使用策略

#### 场景 → 工具映射

```
UI 验证（截图、元素检查）    → playwright（功能全面）
网页搜索 + 数据抓取          → firecrawl（专业抓取）
性能优化（Lighthouse 审计）   → chrome-devtools（无可替代）
AI 驱动操作                  → stagehand-local（自然语言）
```

#### SciFlow 特定场景

**1. 文献搜索流程**
```
Step 1: firecrawl → 搜索 PubMed/Semantic Scholar
Step 2: firecrawl → 提取文献信息（标题、作者、摘要）
Step 3: playwright → 验证导入结果
```

**2. UI 功能验证**
```
Step 1: playwright → 打开功能页面
Step 2: playwright → 截图保存
Step 3: playwright → 检查元素状态
```

**3. 性能优化流程**
```
Step 1: chrome-devtools → Lighthouse 审计
Step 2: chrome-devtools → Performance trace 录制
Step 3: chrome-devtools → 分析瓶颈（LCP、CLS 等）
Step 4: playwright → 验证优化效果
```

---

### 工具配置详情

#### Playwright MCP（日常主力）
```json
{
  "playwright": {
    "type": "stdio",
    "command": "cmd",
    "args": ["/c", "npx", "-y", "@playwright/mcp@latest"]
  }
}
```
- **优势**: 功能全面、多浏览器支持、完全免费
- **适用**: UI 验证、截图、元素检查、多浏览器测试
- **工具名**: `mcp__playwright__browser_*`

#### Firecrawl MCP（网页抓取）
```json
{
  "firecrawl": {
    "type": "stdio",
    "command": "cmd",
    "args": ["/c", "npx", "-y", "firecrawl-mcp@latest"],
    "env": {
      "FIRECRAWL_API_KEY": "已配置"
    }
  }
}
```
- **优势**: 专业网页抓取、结构化数据输出
- **适用**: 网页搜索、批量文献导出、结构化数据提取
- **工具名**: `mcp__firecrawl__firecrawl_*`
- **免费额度**: 每月 500 次抓取

#### Chrome DevTools MCP（性能调试）
```json
{
  "chrome-devtools": {
    "type": "stdio",
    "command": "cmd",
    "args": ["/c", "npx", "-y", "chrome-devtools-mcp"]
  }
}
```
- **优势**: 50+调试工具、Lighthouse 审计、性能追踪
- **适用**: 性能优化、SEO 审计、深度调试
- **不可替代**: 唯一支持 Lighthouse 的工具
- **工具名**: `mcp__chrome-devtools__*`

#### Stagehand MCP（AI 代理）
```json
{
  "stagehand-local": {
    "type": "stdio",
    "command": "C:\\Users\\huang\\AppData\\Roaming\\npm\\stagehand-mcp-local.cmd",
    "env": {
      "STAGEHAND_ENV": "LOCAL",
      "GEMINI_API_KEY": "已配置"
    }
  }
}
```
- **优势**: AI 驱动、自然语言操作
- **适用**: 复杂网页操作、表单填写
- **工具名**: `mcp__stagehand-local__browserbase_*`

---

### 安装与配置

#### 配置文件位置
- 全局配置: `~/.claude.json`（VS Code 扩展）

#### 验证配置
```bash
# 重启 Claude 后，检查工具是否加载
# 在 Claude 中输入 /mcp 查看已连接的 MCP 服务器
```

---

### 常见问题

#### Q: 工具加载失败怎么办？
A: 
1. 检查配置文件语法是否正确
2. 重启 Claude 会话
3. 查看 MCP 服务器状态（/mcp 命令）

#### Q: 如何选择工具？
A:
- 日常 UI 验证 → Playwright
- 网页搜索 + 数据抓取 → Firecrawl
- 性能优化 → Chrome DevTools
- AI 驱动操作 → Stagehand

---

### 最佳实践

1. **工具选择**: 根据场景选择最合适的工具
2. **Windows 兼容**: 所有 npx 命令必须用 `cmd /c` 包装
3. **专业工具**: 批量抓取用 Firecrawl，性能调试用 Chrome DevTools
4. **AI 优先**: 需要理解网页语义时，用 Stagehand

---

### 参考资源

- [Playwright MCP](https://github.com/anthropics/playwright-mcp)
- [Firecrawl MCP](https://github.com/mendableai/firecrawl-mcp)
- [Chrome DevTools MCP](https://github.com/nicholasoxford/chrome-devtools-mcp)
- [MCP 市场](https://mcpmarket.com/categories/browser-automation)

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

### 教训记录规范（必须遵守）

**每次修复报错/bug 之后，必须记录教训，防止同类问题再次发生。**

#### 触发条件

以下情况必须记录教训（缺一不可）：
- 修复了编译错误、运行时报错、部署失败
- 调试花费超过 10 分钟的问题
- 同一类型错误出现第二次（必须记录 + 归因）
- 用户指出的任何代码质量问题

#### 记录位置（按优先级）

1. **MEMORY.md 记忆文件**（`C:\Users\huang\.claude\projects\d--AI-agent-science-flow\memory\`）— 跨会话持久化的教训，格式遵循 frontmatter 规范，`type: feedback`
2. **CLAUDE.md 违规记录** — 流程性违规（跳过 review、跳过部署检查等）追加到对应规则的「违规记录」段落
3. **代码注释** — 涉及某段特定代码的陷阱，在该代码旁加 `// ⚠️ 教训:` 注释

#### 记录模板

```markdown
---
name: <简短教训名>
description: <一句话总结>
metadata:
  type: feedback
---

## 问题
<发生了什么报错/bug>

## 根因
<为什么发生>

## 修复方式
<怎么修的>

## 预防措施
<以后怎么做能避免>

**Why:** <不记录会怎样，比如"下次改 schema 又会忘记 generate">
**How to apply:** <适用场景，比如"每次修改 prisma schema 后立即运行 prisma generate">
```

#### 自查机制

在宣布任务完成前（Phase 5 验证），必须回答：
> 本次修改过程中遇到了哪些报错？是否已将教训记录到记忆文件？

如果答不上来，回头检查一遍本次会话的调试过程。

---

### 数据库规范

- 使用 Prisma schema 定义模型
- 关联关系用 `@relation` 明确声明
- 时间字段用 `DateTime @default(now())`
- 软删除用 `archivedAt` 字段

---

## 部署流程（重要）

### 自动部署

**每次 `git push origin main` 都会自动部署到生产环境。**

```
代码推送 → GitHub Actions CI（类型检查 + 构建 + Lint）→ Vercel 自动部署
```

- 生产 URL：https://sciflow-ai.vercel.app
- Vercel Dashboard：https://vercel.com/dashboard

### 快速命令

```bash
# 部署前检查（必须在推送前运行）
./scripts/deploy.sh check

# 部署到生产环境
./scripts/deploy.sh production

# 创建预览部署（PR 用）
./scripts/deploy.sh preview

# 查看部署状态
./scripts/deploy.sh status

# 回滚到上一版本
./scripts/deploy.sh rollback
```

### Git 工作流

```bash
# 1. 创建功能分支
git checkout -b feature/功能名

# 2. 开发 + 本地测试
npm run dev
./scripts/deploy.sh check

# 3. 提交（遵循 Conventional Commits）
git add .
git commit -m "feat(scope): description"

# 4. 推送并创建 PR
git push origin feature/功能名

# 5. PR 合并后自动部署
```

### Commit 规范

```
<type>(<scope>): <description>

类型：feat | fix | docs | style | refactor | perf | test | chore | ci
示例：feat(matrix): implement gap finder
```

### CI 检查（自动运行）

每次推送都会自动运行：
- ✅ TypeScript 类型检查
- ✅ 项目构建
- ✅ ESLint 检查

**所有检查必须通过才能部署。**

### 环境变量管理

```bash
# 查看环境变量
vercel env ls

# 添加新变量
vercel env add VARIABLE_NAME

# 拉取到本地
vercel env pull .env.local
```

**重要：** 不要提交 `.env.local` 文件，使用 Vercel 环境变量管理。

### 完整部署文档

详见 `docs/DEPLOYMENT.md`，包含：
- 架构概览
- 开发环境搭建
- Git 分支策略
- 测试策略
- 环境管理
- 监控与告警
- 故障排查
- 团队协作
- 安全规范
- 性能优化

### ⚠️ 部署 9 步流程（每次部署必须逐条执行，不可跳过）

**触发条件：用户说"部署"、"上线"、"push"、"合并"等任何暗示发布代码的词语。**

```
Step 1: git checkout -b feature/功能名
Step 2: 本地验证通过（TypeScript + 手动测试）
Step 3: npm ci（lock 文件变更时）
Step 4: ./scripts/deploy.sh check（必须跑，不能只跑 tsc）
Step 5: git commit（Conventional Commits）
Step 6: git push origin feature/功能名
Step 7: 创建 PR（gh pr create 或 MCP）
Step 8: 等 CI 全部通过（gh pr checks）
Step 9: 合并 PR → Vercel 自动部署
```

**违规记录：**
- 2026-07-14：直接推 main，跳过功能分支+PR
- 2026-07-16：跳过 `deploy.sh check`，只跑了 tsc
- 2026-07-16：用户问"为什么有延迟"时自作主张写代码+部署，未经用户确认

**规则：**
1. 每次部署前，逐条检查这 9 步，完成一步打一个 ✅
2. 不确定时，重新读取此段落
3. 用户没有明确说"部署"时，不要主动部署
4. 即使只改了 1 个文件，也必须走完 9 步

---

## 设计文档索引

| 文档 | 内容 |
|------|------|
| `SciFlow_AI_产品设计讨论纪要.md` | 产品定位、板块评估、循环式工作流、落地路线图 |
| `SciFlow_AI_交互设计与技术方案.md` | 11 个交互设计模块 + 完整技术方案（数据库 Schema、API 设计、目录结构） |
| `SciFlow_AI_Claude_API_接入方案.md` | LLM 接入方案（CCS 网关、OpenAI 兼容格式、模型分级策略） |
| `docs/DEPLOYMENT.md` | **部署与运维指南**（架构、环境、CI/CD、监控、故障排查） |
| `CONTRIBUTING.md` | **贡献指南**（开发流程、Git 规范、PR 流程） |

**开发前先读前三个文档，部署前读 `docs/DEPLOYMENT.md`。**

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

---

## Loop Engineering — 自动化循环

> 参考 [loop-engineering](https://github.com/cobusgreyling/loop-engineering)，为 SciFlow 的开发流程接入自动化循环。

### 核心文件

| 文件 | 用途 |
|------|------|
| `LOOP.md` | 循环配置——声明运行哪些模式、频率、限制 |
| `STATE.md` | 循环状态——上次运行时间、高优先级事项、观察列表 |
| `loop-constraints.md` | 红线规则——循环绝不能做的事 |
| `loop-run-log.md` | 运行日志——记录每次循环的决策和结果 |
| `.claude/skills/loop-triage/SKILL.md` | Daily Triage 技能——扫描项目健康度 |
| `.claude/agents/loop-verifier.md` | Verifier agent——独立验证循环产出 |

### 当前运行的循环

#### Daily Triage（L1 report-only）

```
/loop 1d Run $loop-triage. Read STATE.md. Merge findings into High Priority and Watch List. Update Last run. Do not edit code.
```

- 每天扫描：TypeScript 编译、ESLint、TODO/FIXME、Git 状态、依赖健康
- **只报告，不修改代码**
- Token 预算：~50k/run

#### PR Babysitter（Phase 2，待启用）

等项目有了 GitHub Actions CI 后接入。

**GitHub Actions CI 已配置，可以启用 PR Babysitter：**
- 自动运行：TypeScript 检查 + 构建 + Lint
- 触发条件：push to main/master, Pull Request
- 配置文件：`.github/workflows/ci.yml`

### 使用方法

1. **手动触发一次 Daily Triage**：在 Claude Code 中运行上面的 `/loop` 命令
2. **查看状态**：阅读 `STATE.md` 了解项目当前健康状况
3. **查看历史**：阅读 `loop-run-log.md` 了解历次运行记录
4. **修改约束**：编辑 `loop-constraints.md` 增减红线规则
5. **停止循环**：在 Claude Code 中运行 `/loop stop`

### 循环红线（loop-constraints.md 摘要）

- 不要自动 git push/commit
- 不要修改 Prisma schema、.env、认证流程、Supabase 配置、LLM prompts
- 不要自动合并 PR
- 不要删除文件
- 单次变更不超过 50 行、不超过 3 个文件
