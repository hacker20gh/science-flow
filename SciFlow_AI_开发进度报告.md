# SciFlow AI — 项目开发进度报告

> **日期**：2026-07-13
> **状态**：✅ 全部开发阶段完成 + 搜索系统全面优化 + LLM 直连 API + 期刊分区显示

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
| LLM | OpenAI 兼容 API（DeepSeek / MIMO / OpenAI 等直连） |
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

## 三、搜索系统全面优化（2026-07-13 新增）

### 3.1 搜索质量优化

| 优化项 | 文件 | 说明 |
|--------|------|------|
| PubMed 摘要多段提取 | `lib/academic/pubmed.ts` | 支持结构化摘要（BACKGROUND/METHODS/RESULTS） |
| S2 preprint 映射修正 | `lib/academic/semantic-scholar.ts` | Review → JournalArticle |
| OpenAlex retry 逻辑 | `lib/academic/openalex.ts` | 2 次指数退避重试 |
| Unpaywall 并发 5 路 | `lib/academic/unpaywall.ts` | 替换串行查询，速度提升 5x |
| 中文词典 101 条 | `lib/llm/query-preprocessor.ts` | 覆盖常见生物医学术语 |
| PubMed `[tiab]` 字段标签 | `lib/llm/query-preprocessor.ts` | fastPreprocess 也生成优化查询 |
| S2 API Key 接入 | `.env.local` | 解锁引用量 + TLDR 摘要 |
| OA 按 DOI 缓存 24h | `lib/cache.ts` + `lib/academic/aggregator.ts` | 重复搜索秒级返回 |

### 3.2 LLM 统一接入架构

| 模块 | 改动 | 说明 |
|------|------|------|
| `lib/llm/client.ts` | `getOpenAIClient()` + `callExtractionLLM()` | OpenAI 兼容 + CCS fallback |
| `lib/llm/streaming.ts` | `streamOpenAI()` | 流式输出支持 OpenAI SDK |
| `lib/llm/chat-tools.ts` | `streamChatWithOpenAI()` | 工具调用支持 OpenAI 格式 |
| `lib/llm/extraction.ts` | 使用 `getModelForFeature()` | 动态读取 DB 配置模型名 |
| `lib/llm/json-extractor.ts` | `createRetryFunction` 兼容新接口 | 自动选择 OpenAI/Anthropic |
| `app/api/chat/route.ts` | 使用 OpenAI 路径 | AI 助手直连 API |

**8 个 LLM 模块全部支持直连 API**：搜索预处理、信息提取、统计分析、实验设计、排障诊断、论文组装、审稿人模拟、AI 助手对话。

### 3.3 设置面板（新增）

| 功能 | 说明 |
|------|------|
| 30 个供应商下拉选择 | China / International / Aggregator / Local 四组分类 |
| 自动获取模型列表 | 填 URL + Key → 🔄 获取 → 下拉选模型 |
| 10 个供应商预设模型 | 无需获取即可选择 |
| 切换供应商自动重置 | 模型名跟随供应商切换 |
| MIMO Token Plan 支持 | `token-plan-cn.xiaomimimo.com` |

### 3.4 期刊分区显示（新增）

| 功能 | 说明 |
|------|------|
| 本地期刊数据库 | 200+ 常见生物医学期刊（IF/JCR/中科院分区） |
| `/api/journal-metrics` 端点 | 批量查询期刊指标 |
| 论文卡片标签 | Q1/Q2/Q3/Q4 + 影响因子 + 中科院分区 + 预警标记 |
| 文献类型智能推断 | 关键词 fallback（从标题/摘要检测综述/Meta分析/RCT 等） |

### 3.5 性能优化

| 优化项 | 说明 |
|--------|------|
| 搜索流式返回 | 结果先返回，OA 后台异步加载 |
| 多源论文加权排序 | 被多个数据库收录的论文排名更高 |
| 引用网络 DOI fallback | DOI 自动解析为 S2 ID |

### 3.6 筛选增强

| 优化项 | 说明 |
|--------|------|
| 快捷筛选按钮 | 高引用 ≥100 / 近3年 / Q1 期刊 / 仅 OA |
| 期刊名筛选 | 支持期刊名搜索 + Q1-Q4 快捷筛选 |
| 文献类型筛选 | 研究论文 / 综述 / Meta 分析 / 临床试验等 |
| 年份范围筛选 | 起始年-截止年 |
| 激活筛选 pills | 彩色标签 + × 删除 |
| 筛选条件计数 | 按钮显示激活数量 |
| 清除全部 | 一键清除所有筛选 |

### 3.7 Bug 修复（8 项）

| Bug | 修复 | 文件 |
|-----|------|------|
| 搜索竞态条件 | AbortController 取消前一个请求 | `search/page.tsx` |
| 错误响应非 JSON 崩溃 | 安全解析 fallback | `search/page.tsx` |
| Ctrl+K 硬编码中文 | data 属性 + fallback | `search/page.tsx` |
| 10 篇截断无反馈 | 显示跳过数量 + 预览标题 | `search/page.tsx` |
| 全选只选当前页 | 改为全选所有筛选结果 | `search-results.tsx` |
| 筛选后选中未清除 | useEffect 同时重置 selected | `search-results.tsx` |
| paperKey 无 DOI 时重复 | 加作者名拼接 | `search-results.tsx` |
| 搜索历史 projectId 未鉴权 | 加 project 所有权验证 | `route.ts` |

---

## 四、基础设施

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

## 五、LLM 集成

| 模块 | 文件 | 模型角色 | 功能 |
|------|------|----------|------|
| 查询预处理 | `lib/llm/query-preprocessor.ts` | extraction | 自然语言→优化搜索词 |
| 文献提取 | `lib/llm/extraction.ts` | extraction | 结构化实验数据提取 |
| 实验设计 | `lib/llm/experiment-design.ts` | analysis | Protocol 生成 |
| 排障诊断 | `lib/llm/troubleshoot.ts` | analysis | 失败原因分析 |
| 数据分析 | `lib/llm/analysis.ts` | analysis | 统计方法推荐 |
| 论文组装 | `lib/llm/manuscript.ts` | analysis | 5 章节论文草稿 |
| 审稿模拟 | `lib/llm/reviewer.ts` | analysis | 3 位审稿人模拟 |
| AI 对话 | `app/api/chat/route.ts` | chat | SSE 流式对话 |

**LLM 接入架构**：
```
SciFlow → OpenAI 兼容 API（DeepSeek/MIMO/GPT/通义千问等）→ 模型
           ↓ 未配置
         CCS 代理网关（Anthropic SDK）→ 模型
```

- 用户在设置页选择供应商 + 填 API Key
- 8 个模块自动使用配置的 API
- 模型名从 DB 动态读取，切换供应商零代码改动

---

## 六、E2E 工作流验证

```
✅ 搜索文献 → 选论文 → LLM 提取（4 个实验）
✅ 提取审核 → 确认 → 矩阵自动生成（4 维度，1 冲突）
✅ 冲突检测 → ferroptosis ↑ vs ↓
✅ 待办清单 → 4 项待处理
✅ 时间线 → 49 事件折叠为 5 组
✅ 知识面板 → 真实数据（非 demo）
✅ S2 API Key → 引用量 + TLDR 正常显示
✅ 期刊分区 → Q1/Q2 + IF + 中科院分区正常显示
✅ 30 供应商设置 → MIMO Token Plan 配置成功
```

---

## 七、API 路由总览（21 个端点）

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
| `/api/projects/[id]/download-pdf` | POST | OA 全文下载 |
| `/api/projects/[id]/matrix` | GET/POST/DELETE | 机制矩阵 CRUD |
| `/api/projects/[id]/search-history` | GET/DELETE | 搜索历史 |
| `/api/projects/[id]/papers/batch` | POST | 批量添加文献 |
| `/api/papers/search` | POST | 文献搜索 |
| `/api/papers/extract` | POST | 信息提取（SSE 流式） |
| `/api/papers/upload-pdf` | POST | 手动上传 PDF |
| `/api/papers/citation-network` | POST | 引用网络（DOI fallback） |
| `/api/journal-metrics` | POST | 期刊分区查询（新增） |
| `/api/settings` | GET/POST | LLM 配置 |
| `/api/settings/models` | POST | 获取供应商模型列表（新增） |
| `/api/experiments/design` | POST | 实验设计 |
| `/api/experiments/troubleshoot` | POST | 排障诊断 |
| `/api/analysis` | POST | 数据分析 |
| `/api/chat` | POST | AI 对话（SSE） |
| `/api/crossref` | GET | DOI 元数据查询 |
| `/api/scite` | GET | Scite 引用上下文 |
| `/api/zotero` | GET/POST | Zotero 集成 |
| `/api/token-usage` | GET | Token 用量统计 |
| `/api/langfuse/traces` | GET | Langfuse 追踪 |

---

## 八、项目结构

```
app/
├── layout.tsx                              # 根布局
├── (auth)/login/page.tsx                   # 登录页
├── (auth)/signup/page.tsx                  # 注册页
├── (dashboard)/
│   ├── page.tsx                            # 首页（项目列表）
│   ├── settings/page.tsx                   # LLM 设置页（30 供应商）
│   ├── knowledge/page.tsx                  # 科研知识库
│   ├── courses/page.tsx                    # 科研设计实战课
│   └── project/[projectId]/
│       ├── page.tsx                        # 项目概览
│       ├── timeline/page.tsx               # 时间线
│       ├── brain/page.tsx                  # 知识面板
│       ├── papers/page.tsx                 # 文献管理
│       ├── papers/search/page.tsx          # 文献搜索 + 提取
│       ├── experiments/page.tsx            # 实验设计
│       ├── data/page.tsx                   # 数据分析
│       └── manuscript/page.tsx             # 论文组装
├── api/
│   ├── papers/search/route.ts              # 搜索（流式返回）
│   ├── papers/citation-network/route.ts    # 引用网络（DOI fallback）
│   ├── journal-metrics/route.ts            # 期刊分区查询（新增）
│   ├── settings/route.ts                   # LLM 配置
│   ├── settings/models/route.ts            # 获取模型列表（新增）
│   └── ...（其他路由）
components/
├── papers/
│   ├── search-form.tsx                     # 搜索表单（快捷筛选）
│   ├── search-results.tsx                  # 搜索结果（期刊分区 + 筛选增强）
│   └── extraction-review.tsx               # 提取审核
├── matrix/                                 # 机制矩阵
├── timeline/                               # 时间线
├── experiment/                             # 实验设计
├── chat/                                   # AI 对话
└── ...
lib/
├── academic/
│   ├── aggregator.ts                       # 聚合器（OA 缓存 + 排序 + 类型推断）
│   ├── pubmed.ts                           # PubMed（多段摘要）
│   ├── semantic-scholar.ts                 # S2（preprint 修复 + API Key）
│   ├── openalex.ts                         # OpenAlex（retry）
│   ├── unpaywall.ts                        # Unpaywall（并发 5 路）
│   ├── journal-metrics.ts                  # 期刊分区（新增，200+ 期刊）
│   ├── crossref.ts                         # Crossref DOI 查询
│   ├── biorxiv.ts                          # bioRxiv 预印本
│   └── zotero.ts                           # Zotero 集成
├── llm/
│   ├── client.ts                           # 统一接口（OpenAI + CCS fallback）
│   ├── streaming.ts                        # SSE 流式（OpenAI 支持）
│   ├── chat-tools.ts                       # Tool Use（OpenAI 支持）
│   ├── query-preprocessor.ts               # 查询预处理（101 词词典）
│   ├── extraction.ts                       # 文献提取
│   ├── analysis.ts                         # 数据分析
│   ├── experiment-design.ts                # 实验设计
│   ├── troubleshoot.ts                     # 排障诊断
│   ├── manuscript.ts                       # 论文组装
│   ├── reviewer.ts                         # 审稿模拟
│   ├── json-extractor.ts                   # JSON 提取（3 层 fallback）
│   └── context-builder.ts                  # 对话上下文
├── cache.ts                                # 缓存（OA + 搜索结果）
├── auth.ts                                 # NextAuth
└── db-server.ts                            # Prisma 客户端
```

---

## 九、数据库配置

已完成 Supabase PostgreSQL 配置：
- 项目 ID：`zdjzbwmldbjrtnqikpeh`
- 连接方式：Transaction Pooler（端口 6543，IPv4 兼容）
- 11 张表已建 + 索引已加
- Demo 用户已创建

---

## 十、设计文档

| 文档 | 内容 |
|------|------|
| `SciFlow_AI_产品设计讨论纪要.md` | 产品定位、板块评估、循环式工作流 |
| `SciFlow_AI_交互设计与技术方案.md` | 11 个交互设计模块 + 完整技术方案 |
| `SciFlow_AI_Claude_API_接入方案.md` | LLM 接入方案 |
| `CLAUDE.md` | 技术栈、目录结构、开发规范 |
| `docs/DEPLOYMENT.md` | 部署与运维指南 |

---

## 十一、开发进度汇总

| 模块 | 状态 | 说明 |
|------|------|------|
| Phase 0-5b | ✅ | 15 个功能模块全部完成 |
| 搜索系统优化 | ✅ | 21 项优化（PubMed 摘要 + S2 Key + OA 缓存 + 流式返回） |
| LLM 统一接入 | ✅ | 8 模块支持 OpenAI 兼容 API |
| 设置面板 | ✅ | 30 供应商 + 自动获取模型 + MIMO Token Plan |
| 期刊分区 | ✅ | 200+ 期刊数据库 + Q1/Q2/IF/中科院分区 |
| 文献类型推断 | ✅ | 关键词 fallback（综述/Meta分析/RCT 自动检测） |
| Bug 修复 | ✅ | 8 项搜索 bug 全部修复 |
| 安全加固 | ✅ | 15 项安全 bug |
| E2E 验证 | ✅ | 全链路通过 |

---

## 十二、已知待优化项

| 优先级 | 方向 | 说明 |
|--------|------|------|
| 低 | 筛选条件持久化 | URL 参数或 localStorage |
| 低 | 搜索建议 | 历史搜索自动补全 |
| 低 | 更多期刊数据 | 扩充到 500+ |
