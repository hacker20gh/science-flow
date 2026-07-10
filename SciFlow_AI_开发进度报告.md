# SciFlow AI — 项目开发进度报告

> **日期**：2026-07-10
> **状态**：✅ 全部开发阶段完成 + MIMO 兼容 + E2E 工作流验证通过

---

## 一、项目概况

**SciFlow AI** 是一个 AI 驱动的科研全流程工作流网站，覆盖从文献调研到实验设计到论文发表的完整链路。

**一句话定位**：SciFlow 是一个陪你螺旋上升的科研伙伴。每一圈回来，它都比上一圈更懂你的课题。

**技术栈**：

| 层 | 技术 |
|---|------|
| 框架 | Next.js 16 (App Router + Turbopack) |
| 语言 | TypeScript |
| UI | Tailwind CSS + Lucide 图标 |
| 状态 | Zustand（客户端） |
| 数据库 | Supabase PostgreSQL + Prisma 7 |
| 认证 | NextAuth.js (Credentials + bcrypt) |
| LLM | 通过 CCS 代理网关（Anthropic Messages API） |
| 图表 | Recharts |
| PDF 解析 | pdf-parse-new（纯 JS，零原生依赖） |
| 部署 | Vercel + Supabase |

---

## 二、已完成的功能模块（15/15）

### Phase 0: 脚手架 ✅
- Next.js 项目初始化 + TypeScript 严格模式
- Supabase PostgreSQL 数据库（9 张表 + 索引）
- NextAuth.js 认证（邮箱密码 + bcrypt 哈希 + JWT）
- 三栏布局（侧边栏 + 主区 + AI 助手面板）
- 响应式设计（桌面 + 移动端抽屉式侧边栏）

### Phase 1a: 文献搜索 ✅
- 4 源并行搜索（PubMed + Semantic Scholar + OpenAlex + bioRxiv）
- LLM 查询预处理（自然语言→优化搜索词 + MeSH）
- 自动去重（DOI→PMID→标题模糊匹配）
- 高级筛选：文献类型、时间范围、引用量、排序、OA 偏好
- 搜索历史持久化（DB 存储，支持快速重搜）

### Phase 1b: 信息提取 ✅
- **MIMO 兼容**：移除 `response_format`，靠 system prompt 强制 JSON 输出
- **3 层 fallback 提取**：tool_use → 括号匹配 JSON → thinking 块 → schema-aware retry
- **PDF 全文提取**：pdf-parse-new + smartTruncate 智能截断（优先 Methods/Results）
- **自动下载 OA PDF**：提取前自动获取全文，从摘要→全文质量大幅提升
- 单篇/批量提取（并发 3，速率控制）
- 每个实验单元：药物/细胞系/通路/表型/对照/结论/原文引用
- 提取结果审核 UI（确认/跳过/展开详情）
- DOI 409 冲突自动处理（已有文献自动查找 DB ID）

### Phase 1c: 机制矩阵 ✅
- 从提取结果自动生成对比表格（DB 读取，不依赖前端 store）
- 冲突检测（同一通路变化方向不一致）
- Gap Finder（未研究的维度组合）
- 导出：CSV / LaTeX
- DB 持久化（MechanismMatrix 表）

### Phase 2a: 实验设计 ✅
- AI 基于机制矩阵 + 假设自动生成 Protocol
- 输出：分组、试剂列表、分步操作、对照组检查、预期结果
- 推荐样本量（power analysis）

### Phase 2b: 排障诊断 ✅
- 用户描述失败现象→AI 分析原因→排查步骤
- 每步带"确认→"和"排除→"分支
- 严重程度评估 + 快速修复方案

### Phase 3a: 数据分析 ✅
- CSV/TSV 上传 + LLM 统计建议
- Recharts 图表渲染（柱状图/折线图）
- 输出：数据类型识别、推荐方法、p 值、效应量、生物学解读

### Phase 3b: 论文组装 + 审稿人模拟 ✅
- 从项目积累自动组装 5 个章节（Abstract→Discussion）
- **Word 导出**（docx）+ **LaTeX 导出**
- 3 位模拟审稿人（方法学/领域/写作）+ 评分 + 优先修改建议

### Phase 4: AI 助手 ✅
- 项目右侧可收起的对话面板（SSE 流式输出）
- 自动注入项目上下文（项目名、文献、假设、矩阵、实验）
- 过程助手：基于规则的 6 种触发场景 + LLM 个性化建议
- Tool Use：AI 可调用搜索/查看文献/查看矩阵等工具
- Token 预算管理（滑动窗口 + 摘要压缩）

### Phase 5a: 科研知识库 ✅
- 4 个分类 14 篇知识文章
- **P 值交互式模拟器**：调参数→计算功效→蒙特卡洛模拟→可视化
- 覆盖：统计基础 / 实验设计 / 常见方法 / 论文写作

### Phase 5b: 科研设计实战课 ✅
- 4 门课程（生物统计/实验设计/细胞生物学/SCI 写作）
- 带进度追踪的课程详情页

---

## 三、基础设施

### 认证系统
- NextAuth.js + Credentials Provider
- bcrypt 密码哈希（12 rounds）
- JWT Session
- 演示账号：`demo@sciflow.ai` / `demo123`
- API 路由认证保护

### 数据持久化
- Supabase PostgreSQL（Transaction Pooler，端口 6543）
- Prisma 7 ORM（prisma-client-js 生成器）
- 11 张表 + 外键 + 索引
- 所有 CRUD API 使用 $transaction 保证数据一致性

### PDF 全文提取
- **pdf-parse-new**：纯 JS，零原生依赖，Vercel 兼容
- **smartTruncate**：智能截断到 15000 字符，优先 Abstract > Methods > Results
- **自动下载**：提取 API 自动从 OA URL 下载 PDF 并提取全文
- **手动上传**：非 OA 论文支持手动上传 PDF

### 项目管理
- 编辑项目（名称/描述）
- 软删除 + 回收站
- 项目健康度检查

### 导出功能
- **Word (.docx)**：论文组装页下载
- **LaTeX (.tex)**：论文组装页 + 机制矩阵导出
- **CSV**：机制矩阵导出

### 安全加固（15 项已修复）
- ✅ 密码 bcrypt 哈希存储 + 登录校验
- ✅ SSRF 防护（URL 白名单验证）
- ✅ 路径穿越防护（projectId 字符过滤）
- ✅ API 写入操作要求登录
- ✅ 文件大小限制 50MB
- ✅ 所有路由 prisma null 守卫
- ✅ req.json() try/catch 包裹
- ✅ Hypotheses body.statement null crash 修复
- ✅ db.ts 竞态条件修复
- ✅ 所有写入操作 $transaction 事务保护
- ✅ extractions 跨项目校验
- ✅ 字段必填校验
- ✅ 错误响应结构化（非静默吞错）
- ✅ Prisma schema 缺失索引补齐
- ✅ Edge Runtime + Prisma 隔离（db.ts / db-server.ts 分离）

---

## 四、LLM 集成

| 模块 | 文件 | CCS 角色 | 功能 |
|------|------|---------|------|
| 查询预处理 | `lib/llm/query-preprocessor.ts` | Haiku | 自然语言→优化搜索词 |
| 文献提取 | `lib/llm/extraction.ts` | Haiku | 结构化实验数据提取 |
| 实验设计 | `lib/llm/experiment-design.ts` | Opus | Protocol 生成 |
| 排障诊断 | `lib/llm/troubleshoot.ts` | Opus | 失败原因分析 |
| 数据分析 | `lib/llm/analysis.ts` | Opus | 统计方法推荐 |
| 论文组装 | `lib/llm/manuscript.ts` | Opus | 5 章节论文草稿 |
| 审稿模拟 | `lib/llm/reviewer.ts` | Opus | 3 位审稿人模拟 |
| AI 对话 | `app/api/chat/route.ts` | Sonnet | SSE 流式对话 |

**MIMO 兼容策略**：
- 移除所有 `response_format: {type: "json_object"}`（MIMO 不支持）
- System prompt 内嵌完整 JSON 示例结构
- 3 层 fallback：text block JSON → thinking block JSON → schema-aware retry with example
- 所有模块 retryFn 传入 Zod schema 校验

---

## 五、E2E 工作流验证

```
✅ 搜索文献 → 选论文 → LLM 提取（4 个实验）
✅ 提取审核 → 确认 → 矩阵自动生成（4 维度，1 冲突）
✅ 冲突检测 → ferroptosis ↑ vs ↓
✅ 待办清单 → 4 项待处理
✅ 时间线 → 49 事件折叠为 5 组
✅ 知识面板 → 真实数据（非 demo）
```

---

## 六、API 路由总览（19 个端点）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/projects` | GET/POST | 项目列表/创建 |
| `/api/projects/[id]` | GET/PATCH/DELETE | 项目详情/更新/删除 |
| `/api/projects/[id]/papers` | GET/POST | 文献列表/添加 |
| `/api/projects/[id]/extractions` | POST | 保存提取结果 |
| `/api/projects/[id]/extractions/batch` | POST | 批量保存提取 |
| `/api/projects/[id]/experiments` | GET/POST | 实验列表/创建 |
| `/api/projects/[id]/timeline` | GET/POST | 时间线事件 |
| `/api/projects/[id]/hypotheses` | GET/POST | 假设管理 |
| `/api/projects/[id]/manuscripts` | GET/POST | 论文草稿 |
| `/api/projects/[id]/upload` | POST | PDF 上传 |
| `/api/projects/[id]/upload/extract` | POST | 本地 PDF 提取 |
| `/api/projects/[id]/download-pdf` | POST | OA 全文下载（自动提取文本） |
| `/api/projects/[id]/matrix` | GET/POST/DELETE | 机制矩阵 CRUD |
| `/api/projects/[id]/search-history` | GET/POST/DELETE | 搜索历史 |
| `/api/projects/[id]/permanent-delete` | POST | 永久删除 |
| `/api/projects/[id]/restore` | POST | 恢复项目 |
| `/api/papers/search` | POST | 文献搜索 |
| `/api/papers/extract` | POST | 信息提取（含自动下载） |
| `/api/papers/upload-pdf` | POST | 手动上传 PDF |
| `/api/experiments/design` | POST | 实验设计 |
| `/api/experiments/troubleshoot` | POST | 排障诊断 |
| `/api/analysis` | POST | 数据分析 |
| `/api/chat` | POST | AI 对话（SSE） |
| `/api/settings` | GET/POST | LLM 配置 |
| `/api/auth/[...nextauth]` | GET/POST | NextAuth 认证 |
| `/api/auth/register` | POST | 用户注册 |

---

## 七、项目结构

```
app/
├── layout.tsx                              # 根布局（SessionProvider）
├── (auth)/login/page.tsx                   # 登录页
├── (auth)/signup/page.tsx                  # 注册页
├── (dashboard)/
│   ├── page.tsx                            # 首页（项目列表 + 编辑/删除）
│   ├── recycle-bin/page.tsx                # 回收站
│   ├── settings/page.tsx                   # LLM 设置页
│   ├── knowledge/page.tsx                  # 科研知识库 + P 值模拟器
│   ├── courses/page.tsx                    # 科研设计实战课
│   └── project/[projectId]/
│       ├── layout.tsx                      # 项目布局（侧边栏 + AI + 快捷栏）
│       ├── page.tsx                        # 项目概览 + 健康度检查 + 编辑
│       ├── timeline/page.tsx               # 时间线（按类型折叠）
│       ├── brain/page.tsx                  # 知识面板（DB 读取真实数据）
│       ├── papers/page.tsx                 # 文献管理（列表 + 上传 PDF）
│       ├── papers/search/page.tsx          # 文献搜索 + 提取 + 搜索历史
│       ├── experiments/page.tsx            # 实验设计
│       ├── experiments/troubleshoot/page.tsx  # 排障诊断
│       ├── data/page.tsx                   # 数据分析 + 图表
│       └── manuscript/page.tsx             # 论文组装 + 审稿人
├── api/
│   ├── auth/                               # 认证 API
│   ├── projects/                           # 项目 CRUD + 子资源
│   ├── papers/                             # 搜索 + 提取 + 上传 PDF
│   ├── experiments/                        # 设计 + 排障
│   ├── analysis/route.ts                   # 数据分析
│   ├── manuscript/                         # 论文 + 审稿
│   ├── chat/route.ts                       # AI 对话
│   └── settings/route.ts                   # LLM 配置
components/
├── layout/                                 # sidebar + project-shell + providers + quick-action-bar
├── onboarding/                             # 3 步项目创建向导
├── papers/                                 # search-form + search-results + extraction-review + pdf-uploader
├── matrix/                                 # mechanism-matrix
├── timeline/                               # timeline（按类型折叠 + 批量合并）
├── experiment/                             # design-card + troubleshoot
├── chat/                                   # chat-panel（Markdown + 流式 + Tool Use）
├── assistant/                              # process-assistant
├── charts/                                 # chart-renderer (Recharts)
├── knowledge/                              # p-value-simulator
└── project/                                # health-check + workflow-progress
lib/
├── academic/                               # 4 源搜索 + 聚合器 + bioRxiv
├── llm/                                    # 9 个 LLM 模块（MIMO 兼容）
│   ├── client.ts                           # 客户端 + 重试 + DB 配置缓存
│   ├── json-extractor.ts                   # 通用 JSON 提取（3 层 fallback）
│   ├── extraction.ts                       # 文献提取 + 智能截断
│   ├── experiment-design.ts                # 实验设计
│   ├── troubleshoot.ts                     # 排障诊断
│   ├── analysis.ts                         # 数据分析
│   ├── manuscript.ts                       # 论文组装
│   ├── reviewer.ts                         # 审稿模拟
│   ├── context-builder.ts                  # 对话上下文增强
│   ├── streaming.ts                        # SSE 流式工具
│   └── chat-tools.ts                       # 对话 Tool Use（6 个工具）
├── matrix/                                 # 矩阵生成器 + demo 数据
├── timeline/                               # 事件系统
├── assistant/                              # 过程助手
├── llm.ts                                  # LLM 客户端（兼容导出）
├── auth.ts                                 # NextAuth 配置
├── db.ts                                   # Edge-safe 数据库访问
├── db-server.ts                            # Node.js Prisma 客户端
├── power-analysis.ts                       # 样本量计算
├── dilution-calculator.ts                  # 稀释计算器
└── export.ts                               # Word/LaTeX/CSV 导出
store/
└── project-store.ts                        # Zustand 状态管理
prisma/
└── schema.prisma                           # 11 张表 + 索引
```

---

## 八、数据库配置

已完成 Supabase PostgreSQL 配置：
- 项目 ID：`zdjzbwmldbjrtnqikpeh`
- 连接方式：Transaction Pooler（端口 6543，IPv4 兼容）
- 11 张表已建 + 索引已加
- Demo 用户已创建（密码已 bcrypt 哈希）

---

## 九、设计文档

| 文档 | 内容 |
|------|------|
| `SciFlow_AI_产品设计讨论纪要.md` | 产品定位、板块评估、循环式工作流 |
| `SciFlow_AI_交互设计与技术方案.md` | 11 个交互设计模块 + 完整技术方案 |
| `SciFlow_AI_Claude_API_接入方案.md` | LLM 接入方案（CCS 网关） |
| `CLAUDE.md` | 技术栈、目录结构、开发规范（开发阶段全部 ✅） |
| `docs/supabase-setup.md` | Supabase 数据库配置指南 |

---

## 十、开发进度汇总

| 模块 | 状态 | 说明 |
|------|------|------|
| Phase 0: 脚手架 | ✅ | Next.js + Supabase + Auth + 布局 |
| Phase 1a: 文献搜索 | ✅ | 4 源聚合 + LLM 查询优化 + 搜索历史 |
| Phase 1b: 信息提取 | ✅ | MIMO 兼容 + PDF 全文 + 自动下载 + 批量 |
| Phase 1c: 机制矩阵 | ✅ | 冲突检测 + Gap Finder + DB 持久化 |
| Phase 2a: 实验设计 | ✅ | AI Protocol 生成 + 样本量 |
| Phase 2b: 排障诊断 | ✅ | 诊断 + 分支排查 |
| Phase 3a: 数据分析 | ✅ | CSV + LLM + Recharts |
| Phase 3b: 论文组装 | ✅ | 5 章节 + Word/LaTeX + 审稿人 |
| Phase 4: AI 助手 | ✅ | SSE + Tool Use + 上下文增强 + Token 预算 |
| Phase 5a: 知识库 | ✅ | P 值模拟器 + 14 篇文章 |
| Phase 5b: 实战课 | ✅ | 4 门课程 + 健康度检查 |
| 安全加固 | ✅ | 15 项安全 bug 全部修复 |
| MIMO 兼容 | ✅ | 7 个 LLM 模块全部适配 |
| PDF 全文提取 | ✅ | pdf-parse-new + 自动下载 + 智能截断 |
| 项目管理 | ✅ | 编辑/删除/回收站 |
| 时间线优化 | ✅ | 按类型折叠 + 批量合并 |
| E2E 验证 | ✅ | 搜索→提取→矩阵→冲突→待办 全链路通过 |

---

## 十一、Git 提交记录（近期）

```
f95e320 docs: 更新开发进度报告（全部阶段完成）
9cf9511 feat: 补全设计文档要求的 4 个功能
d694fb6 fix: 安全审查 15 个 bug 全部修复
47e4826 fix: 彻底解决 Edge Runtime + Prisma 冲突
4419d28 chore: gitignore .prisma generated files
090b5d8 feat: 替换 Supabase Auth 为 NextAuth.js
545a9fb feat: 修复未完成模块 — Prisma连接/导出/图表/动态化
beef58f ui: 用 Lucide SVG 图标替换 emoji + 设计系统配色
b847258 feat: 科研知识库 + 实战课页面
0cdef5d feat: CRUD API + 前端对接数据库 + 设置页简化
```
