# SciFlow AI — 项目开发进度报告

> **日期**：2026-07-10
> **状态**：核心功能开发完成，待细化优化

---

## 一、项目概况

**SciFlow AI** 是一个 AI 驱动的科研全流程工作流网站，覆盖从文献调研到实验设计到论文发表的完整链路。

**一句话定位**：SciFlow 是一个陪你螺旋上升的科研伙伴。每一圈回来，它都比上一圈更懂你的课题。

**技术栈**：

| 层 | 技术 |
|---|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| 状态管理 | Zustand |
| 数据库 | Supabase (PostgreSQL) |
| LLM | 通过 CCS 网关（OpenAI 兼容格式） |
| 部署 | Vercel + Supabase |

---

## 二、已完成的功能模块

### 2.1 文献搜索

**状态**：✅ 完成

#### 功能描述
- 4 个学术数据库并行搜索（PubMed + Semantic Scholar + OpenAlex + bioRxiv）
- LLM 查询预处理：用户输入任意语言/格式 → 自动转换为优化的英文搜索查询
- 自动去重（DOI → PMID → 标题模糊匹配）
- 按引用量、时间、相关性排序
- OA PDF 链接发现（Unpaywall API）

#### 文件清单
```
lib/academic/pubmed.ts            # PubMed API 客户端
lib/academic/semantic-scholar.ts  # Semantic Scholar 客户端
lib/academic/openalex.ts          # OpenAlex 客户端
lib/academic/biorxiv.ts           # bioRxiv 客户端
lib/academic/unpaywall.ts         # Unpaywall 客户端
lib/academic/aggregator.ts        # 聚合搜索器
lib/llm/query-preprocessor.ts     # LLM 查询预处理
app/api/papers/search/route.ts    # 搜索 API 端点
```

#### 搜索筛选
- 文献类型：研究论文、综述、Meta 分析、临床试验、预印本
- 时间范围：最近 3/5/10 年 + 自定义
- 最低引用：0/10/50/100 + 自定义
- 排序方式：相关性/引用量/发表时间/影响因子
- OA 偏好：优先显示有全文的

#### UI 组件
- `components/papers/search-form.tsx`：搜索表单 + 高级筛选
- `components/papers/search-results.tsx`：结果列表 + 标签系统

#### 标签颜色体系
```
🔵 蓝色  → 年份 + 中等引用（20-99）
🟣 紫色  → 文献类型（综述、Meta 分析、临床试验）
🟠 橙色  → 高被引（≥100）
🟢 绿色  → 有全文可提取
⚪ 灰色  → 仅摘要 / 低引用（<20）
```

---

### 2.2 信息提取

**状态**：✅ 完成

#### 功能描述
- LLM 从论文摘要/全文中提取结构化机制信息
- 支持单篇提取和批量提取（并发 3，速率控制）
- Structured Output（Zod Schema）保证返回格式正确
- 每篇论文可提取多个实验单元
- 每个提取结果附带原文引用（防幻觉）

#### 提取内容（每篇论文 → 多个实验单元）
```json
{
  "experiments": [
    {
      "drug_intervention": { "name": "sorafenib", "concentration": "2 μM", "duration": "24h" },
      "model": { "cell_line": "Huh7", "species": "Human" },
      "pathway_effects": [{ "pathway": "NF-κB", "direction": "up", "significance": "p<0.01" }],
      "phenotype_effects": [{ "phenotype": "PD-L1 expression", "direction": "up", "fold_change": "2.3x" }],
      "controls": ["DMSO vehicle"],
      "statistical_test": "One-way ANOVA",
      "sample_size": 3,
      "conclusion": "Sorafenib upregulates PD-L1 via NF-κB",
      "evidence_quote": "Sorafenib treatment (2 μM, 24h) significantly increased..."
    }
  ]
}
```

#### 文件清单
```
lib/llm/extraction.ts             # 提取引擎（Zod Schema + Prompt + 单篇/批量）
app/api/papers/extract/route.ts   # 提取 API 端点
components/papers/extraction-review.tsx  # 提取结果审核 UI
```

#### 防幻觉策略
| 层级 | 策略 |
|------|------|
| Prompt 层 | 要求附带原文引用 |
| 输出层 | Structured Output 保证格式 |
| 用户层 | 提取结果可编辑、可验证 |
| 交叉验证 | 多篇文献支持同一结论 → 置信度提升 |

---

### 2.3 机制矩阵

**状态**：✅ 完成

#### 功能描述
- 从提取结果自动生成对比表格
- 行 = 实验（论文 × 实验条件），列 = 通路/表型维度
- 自动检测冲突（同一维度变化方向不一致）
- 自动检测空白（未研究的维度组合）
- 可筛选（通路/表型）、可导出（CSV/LaTeX）

#### 文件清单
```
lib/matrix/generator.ts           # 矩阵数据生成器
lib/matrix/demo-data.ts           # Demo 数据
components/matrix/mechanism-matrix.tsx  # 矩阵交互组件
```

#### 矩阵交互
- 悬停单元格：Tooltip 显示详情
- 点击单元格：弹窗显示文献、实验条件、变化方向、原文引用
- 筛选：可只看通路 / 只看表型
- 冲突标记：橙色警告
- 导出：CSV / LaTeX / PNG

#### 矩阵结构示例
```
              │ NF-κB        │ PD-L1        │ Apoptosis  │ MAPK    │
──────────────┼──────────────┼──────────────┼────────────┼─────────│
sorafenib     │              │              │            │         │
 2μM Huh7     │  ↑ (p<0.01)  │  ↑ 2.3x      │            │         │
──────────────┼──────────────┼──────────────┼────────────┼─────────│
sorafenib     │              │  ↓ 0.6x      │            │         │
 10μM HepG2   │              │              │            │         │
──────────────┼──────────────┼──────────────┼────────────┼─────────│
              │              │ ⚠️ 冲突      │            │         │
```

---

### 2.4 知识面板（Brain 页面）

**状态**：✅ 完成

#### 功能描述
知识面板是课题的"大脑"，由 3 个联动模块组成：

1. **机制矩阵**：多文献 + 实验数据的结构化对比表格
2. **假设追踪器**：当前假设 + 支持/反对证据 + 强度百分比
3. **待办清单**：缺什么实验/对照/数据，可一键补全

#### 文件清单
```
app/(dashboard)/project/[projectId]/brain/page.tsx
```

#### 假设追踪器示例
```
假设：sorafenib 通过 NF-κB 上调 HCC 中的 PD-L1 表达
状态：🔄 验证中
证据强度：████████░░ 80%

✅ 支持证据 (3)
• Liu 2024：NF-κB 与 PD-L1 正相关
• Exp#2：sorafenib 2-3μM 上调 PD-L1
• Exp#3：NF-κB 抑制剂减弱上调

⚠️ 反对证据 (1)
• Chen 2023：10μM 下调（浓度差异）
```

---

### 2.5 实验设计

**状态**：✅ 完成

#### 功能描述
- 基于机制矩阵和假设，AI 自动生成实验方案
- 输出：分组、Protocol、对照组检查、预期结果、参考文献
- 自动检查对照组完整性
- 推荐样本量

#### 文件清单
```
lib/llm/experiment-design.ts              # 实验设计 LLM 引擎
app/api/experiments/design/route.ts       # 实验设计 API
components/experiment/design-card.tsx     # 方案展示组件
app/(dashboard)/project/[projectId]/experiments/page.tsx  # 实验页面
```

#### 生成的方案内容
| 部分 | 内容 |
|------|------|
| 概览 | 假设、设计依据、推荐样本量 |
| 实验分组 | 各组名称、处理条件、目的 |
| Protocol | 细胞系、传代范围、试剂列表、分步操作、检测指标 |
| 对照组检查 | Vehicle/阳性/阴性对照是否齐全 |
| 预期结果 | 可能的结果场景 + 解释 + 下一步建议 |
| 参考文献 | 从机制矩阵中引用的相关文献 |

---

### 2.6 实验排障

**状态**：✅ 完成

#### 功能描述
- 用户描述实验失败现象 → AI 分析可能原因 → 给出排查建议
- 输出：严重程度、可能原因（按可能性排序）、排查步骤、快速修复方案
- 每个排查步骤带"确认→"和"排除→"两个分支

#### 文件清单
```
lib/llm/troubleshoot.ts                           # 排障 LLM 引擎
app/api/experiments/troubleshoot/route.ts          # 排障 API
components/experiment/troubleshoot.tsx             # 排障 UI 组件
app/(dashboard)/project/[projectId]/experiments/troubleshoot/page.tsx  # 排障页面
```

#### 诊断输出示例
```
🔴 问题严重程度：中等

🔍 可能的原因：
1. 浓度过高（高度可能）
   → sorafenib 在 Huh7 的 IC50 约 3-8μM，5μM 已接近毒性阈值
2. 传代过高（中等可能）
   → P15+ 细胞对药物更敏感

📋 排查步骤：
Step 1：降低浓度到 1-3μM
  确认→ 细胞存活 → 继续实验
  排除→ 下一步排查

⚡ 快速修复：浓度改为 2μM
```

---

### 2.7 数据分析

**状态**：✅ 完成

#### 功能描述
- 用户上传 CSV/TSV 实验数据
- AI 自动识别数据类型（剂量-效应、时间序列、组间比较）
- 推荐统计方法 + 解释为什么
- 输出：描述性统计、检验结果、p 值、效应量
- 生物学意义解读 + 注意事项
- 图表类型推荐

#### 文件清单
```
lib/llm/analysis.ts                           # 数据分析 LLM 引擎
app/api/analysis/route.ts                     # 分析 API
app/(dashboard)/project/[projectId]/data/page.tsx  # 数据页面
```

#### 分析输出
| 部分 | 内容 |
|------|------|
| 数据类型 | 剂量-效应 / 时间序列 / 组间比较 |
| 推荐统计方法 | One-way ANOVA + Tukey 等 |
| 结果 | 描述性统计、检验结果、p 值、效应量 |
| 解读 | 统计学结论 + 生物学意义 + 注意事项 |
| 图表建议 | 类型、标题、轴标签、显著性标注 |

---

### 2.8 论文组装

**状态**：✅ 完成

#### 功能描述
- 从项目的积累（文献矩阵 + 实验数据 + 假设）自动组装论文草稿
- 支持按章节生成或一键全部生成
- 每个章节带：内容、字数、引用列表、修改建议

#### 论文章节
| 章节 | 数据来源 | 说明 |
|------|---------|------|
| Abstract | 全部积累 | 150-250 词结构化摘要 |
| Introduction | 机制矩阵 | 倒三角结构，引用矩阵中的文献 |
| Methods | 实验 Protocol | 可复现的实验细节 |
| Results | 实验数据 | 按逻辑顺序展示发现 |
| Discussion | 假设验证 + 文献 | 解读结果，联系文献，局限性 |

#### 文件清单
```
lib/llm/manuscript.ts                               # 论文组装 LLM 引擎
app/api/manuscript/route.ts                          # 论文组装 API
app/(dashboard)/project/[projectId]/manuscript/page.tsx  # 论文页面
```

---

### 2.9 审稿人模拟

**状态**：✅ 完成

#### 功能描述
- AI 模拟 3 位不同角度的审稿人审阅论文草稿
- 每位审稿人从不同角度审查

#### 三位审稿人
| 审稿人 | 角色 | 关注点 |
|--------|------|--------|
| 审稿人 1 | 方法学专家 | 实验设计、统计方法、可重复性 |
| 审稿人 2 | 领域专家 | 新颖性、生物学意义、文献覆盖 |
| 审稿人 3 | 写作专家 | 逻辑、清晰度、引用规范 |

#### 输出
- 每位审稿人：总体评价（接收/小修/大修/拒稿）+ 评分(1-10) + 具体意见
- 意见分类：major（必须改）/ minor（应该改）/ suggestion（建议改）
- 综合判断 + 优先修改建议

#### 文件清单
```
lib/llm/reviewer.ts                      # 审稿人模拟 LLM 引擎
app/api/manuscript/review/route.ts       # 审稿 API
```

---

### 2.10 时间线

**状态**：✅ 完成

#### 功能描述
- 记录项目所有事件，包括失败和转向
- 9 种事件类型
- 自动记录：搜索、提取、实验设计会自动产生事件
- 可按类型筛选

#### 事件类型
| 类型 | 图标 | 颜色 |
|------|------|------|
| 文献搜索 | 🔍 | 蓝色 |
| 文献提取 | 📖 | 紫色 |
| 假设提出 | 💡 | 琥珀色 |
| 实验设计 | 🧪 | 绿色 |
| 实验完成 | ✅ | 深绿色 |
| 实验失败 | ⚠️ | 红色 |
| 方向转变 | 🔀 | 紫色 |
| 矩阵更新 | 📊 | 蓝色 |
| 草稿生成 | 📝 | 灰色 |

#### 文件清单
```
lib/timeline/events.ts                              # 事件系统
components/timeline/timeline.tsx                     # 时间线组件
app/(dashboard)/project/[projectId]/timeline/page.tsx  # 时间线页面
```

---

### 2.11 AI 助手

**状态**：✅ 完成

#### 功能描述
- 项目右侧可收起的对话面板
- SSE 流式输出，打字机效果
- 自动注入项目上下文（项目名、文献列表、假设）
- 用 CCS_MODEL_CHAT 模型

#### 文件清单
```
app/api/chat/route.ts                # 对话 API（SSE 流式）
components/chat/chat-panel.tsx       # 对话面板组件
components/layout/project-shell.tsx  # 项目壳组件（集成 AI 面板）
```

---

### 2.12 过程助手

**状态**：✅ 完成

#### 功能描述
- 根据项目状态，在关键决策点自动给出指导
- 基于规则的快速判断（零延迟，不调 LLM）
- 6 种触发场景

#### 触发场景
| 场景 | 提醒 | 出现位置 |
|------|------|---------|
| 搜了文献没提取 | "选中文献后点'提取信息'" | 搜索页 |
| 很多文献只有摘要 | "上传 PDF 可以提取更完整信息" | 搜索页 |
| 矩阵有冲突 | "设计实验解决冲突" + 链接 | 知识面板 |
| 矩阵有空白 | "发现未覆盖维度" + 链接 | 知识面板 |
| 没搜文献就做实验 | "建议先搜索文献" + 链接 | 实验页 |
| 有冲突没解决 | "先解决文献中的冲突" | 实验页 |

#### 文件清单
```
lib/assistant/process-assistant.ts           # 助手逻辑
components/assistant/process-assistant.tsx   # 助手 UI 组件
```

---

### 2.13 状态管理

**状态**：✅ 完成

#### 功能描述
- Zustand store 管理项目文献和提取结果
- 文献入库、提取状态更新、矩阵自动刷新
- 时间线事件自动记录
- 串联搜索→提取→矩阵完整流程

#### 文件清单
```
store/project-store.ts
```

---

### 2.14 数据库

**状态**：✅ 准备完成（待用户配置 Supabase）

#### 功能描述
- Supabase 客户端（浏览器端 + 服务端）
- 9 张表的完整建表脚本
- 设置指南

#### 数据库表
| 表 | 说明 |
|------|------|
| User | 用户 |
| Project | 项目 |
| Paper | 文献 |
| Extraction | 提取结果 |
| Hypothesis | 假设 |
| Experiment | 实验 |
| ExperimentData | 实验数据 |
| TimelineEvent | 时间线事件 |
| Manuscript | 论文草稿 |

#### 文件清单
```
lib/supabase.ts                        # Supabase 客户端
supabase/migrations/001_init.sql       # 建表脚本
docs/supabase-setup.md                 # 设置指南
```

---

## 三、项目结构

```
sciflow-ai/
├── app/
│   ├── layout.tsx                           # 根布局
│   ├── (dashboard)/
│   │   ├── layout.tsx                       # Dashboard 布局
│   │   ├── page.tsx                         # 首页（项目列表）
│   │   └── project/[projectId]/
│   │       ├── layout.tsx                   # 项目布局（侧边栏 + AI 面板）
│   │       ├── page.tsx                     # 项目概览
│   │       ├── timeline/page.tsx            # 时间线
│   │       ├── brain/page.tsx               # 知识面板（矩阵 + 假设 + 待办）
│   │       ├── papers/
│   │       │   ├── page.tsx                 # 文献管理
│   │       │   └── search/page.tsx          # 文献搜索
│   │       ├── experiments/
│   │       │   ├── page.tsx                 # 实验设计
│   │       │   └── troubleshoot/page.tsx    # 排障诊断
│   │       ├── data/page.tsx                # 数据分析
│   │       └── manuscript/page.tsx           # 论文组装 + 审稿人模拟
│   └── api/
│       ├── chat/route.ts                    # AI 对话（SSE）
│       ├── papers/
│       │   ├── search/route.ts              # 文献搜索
│       │   └── extract/route.ts             # 信息提取
│       ├── experiments/
│       │   ├── design/route.ts              # 实验设计
│       │   └── troubleshoot/route.ts        # 排障诊断
│       ├── analysis/route.ts                # 数据分析
│       └── manuscript/
│           ├── route.ts                     # 论文组装
│           └── review/route.ts              # 审稿人模拟
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx                      # 侧边栏
│   │   └── project-shell.tsx                # 项目壳（含 AI 面板）
│   ├── papers/
│   │   ├── search-form.tsx                  # 搜索表单
│   │   ├── search-results.tsx               # 搜索结果
│   │   └── extraction-review.tsx            # 提取审核
│   ├── matrix/
│   │   └── mechanism-matrix.tsx              # 机制矩阵
│   ├── timeline/
│   │   └── timeline.tsx                     # 时间线
│   ├── experiment/
│   │   ├── design-card.tsx                  # 实验方案卡片
│   │   └── troubleshoot.tsx                 # 排障 UI
│   ├── chat/
│   │   └── chat-panel.tsx                   # AI 对话面板
│   └── assistant/
│       └── process-assistant.tsx            # 过程助手卡片
├── lib/
│   ├── academic/
│   │   ├── pubmed.ts                        # PubMed API
│   │   ├── semantic-scholar.ts              # Semantic Scholar API
│   │   ├── openalex.ts                      # OpenAlex API
│   │   ├── biorxiv.ts                       # bioRxiv API
│   │   ├── unpaywall.ts                     # Unpaywall API
│   │   └── aggregator.ts                    # 聚合搜索器
│   ├── llm/
│   │   ├── client.ts                        # CCS LLM 客户端
│   │   ├── query-preprocessor.ts            # 查询预处理
│   │   ├── extraction.ts                    # 文献提取
│   │   ├── experiment-design.ts             # 实验设计
│   │   ├── troubleshoot.ts                  # 排障诊断
│   │   ├── analysis.ts                      # 数据分析
│   │   ├── manuscript.ts                    # 论文组装
│   │   └── reviewer.ts                      # 审稿人模拟
│   ├── matrix/
│   │   ├── generator.ts                     # 矩阵生成器
│   │   └── demo-data.ts                     # Demo 数据
│   ├── timeline/
│   │   └── events.ts                        # 事件系统
│   ├── assistant/
│   │   └── process-assistant.ts             # 过程助手
│   ├── supabase.ts                          # Supabase 客户端
│   └── db.ts                                # Prisma 客户端
├── store/
│   └── project-store.ts                     # Zustand 状态管理
├── prisma/
│   └── schema.prisma                        # Prisma Schema
├── supabase/
│   └── migrations/001_init.sql              # 数据库建表脚本
├── docs/
│   └── supabase-setup.md                    # Supabase 设置指南
├── CLAUDE.md                                # 项目开发指南
├── .env.example                             # 环境变量模板
└── .gitignore
```

---

## 四、文档清单

| 文档 | 路径 | 内容 |
|------|------|------|
| 产品设计纪要 | `SciFlow_AI_产品设计讨论纪要.md` | 产品定位、板块评估、循环式工作流 |
| 交互设计与技术方案 | `SciFlow_AI_交互设计与技术方案.md` | 11 个交互设计模块 + 完整技术方案 |
| LLM 接入方案 | `SciFlow_AI_Claude_API_接入方案.md` | CCS 网关、OpenAI 兼容格式、模型分级 |
| 项目开发指南 | `CLAUDE.md` | 技术栈、目录结构、开发规范 |
| Supabase 设置 | `docs/supabase-setup.md` | 5 步完成数据库配置 |

---

## 五、待完成事项

### 🔴 高优先级
| 事项 | 说明 |
|------|------|
| Supabase 实际接入 | API 路由读写数据库，数据持久化 |
| 认证系统 | Supabase Auth 登录/注册 |
| 科研知识库 | p 值、统计功效、对照组设计等知识卡片 + 交互模拟器 |

### 🟡 中优先级
| 事项 | 说明 |
|------|------|
| 科研设计实战课 | 3 级课程体系 + 健康度检查 |
| PWA 支持 | 移动端适配 |
| 全文 PDF 解析 | GROBID 解析 + 全文提取 |

### 🟢 低优先级
| 事项 | 说明 |
|------|------|
| 论文导出 | LaTeX + Word + PDF 格式 |
| Zotero/EndNote 集成 | 文献管理工具对接 |
| 团队协作 | 多人共享项目 |
