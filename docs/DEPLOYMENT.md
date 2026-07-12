# SciFlow AI 开发与部署指南

> 本文档是 SciFlow AI 项目的完整开发与部署手册，涵盖从本地开发到生产部署的全流程。

---

## 目录

1. [架构概览](#1-架构概览)
2. [开发环境搭建](#2-开发环境搭建)
3. [Git 工作流](#3-git-工作流)
4. [本地开发流程](#4-本地开发流程)
5. [测试策略](#5-测试策略)
6. [部署流程](#6-部署流程)
7. [环境管理](#7-环境管理)
8. [监控与告警](#8-监控与告警)
9. [故障排查](#9-故障排查)
10. [团队协作](#10-团队协作)
11. [安全规范](#11-安全规范)
12. [性能优化](#12-性能优化)
13. [附录](#13-附录)

---

## 1. 架构概览

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel (CDN + Serverless)                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐     │
│  │   Next.js  │  │  API Routes │  │  Edge Functions    │     │
│  │   Frontend │  │  (Node.js)  │  │  (Middleware)      │     │
│  └────────────┘  └────────────┘  └────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Supabase    │     │  CCS Gateway │     │  External    │
│  (Database)  │     │  (LLM)       │     │  Services    │
└──────────────┘     └──────────────┘     └──────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Claude      │     │  DeepSeek    │     │  GPT/Qwen    │
│  (Analysis)  │     │  (Chat)      │     │  (Fallback)  │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 技术栈

| 层 | 技术 | 用途 |
|---|------|------|
| 框架 | Next.js 15 (App Router) | 全栈框架 |
| 语言 | TypeScript | 类型安全 |
| UI | Tailwind CSS + shadcn/ui | 样式 + 组件库 |
| 数据库 | PostgreSQL (Supabase) | 数据存储 |
| ORM | Prisma | 数据库访问 |
| 认证 | NextAuth.js | 用户认证 |
| LLM | CCS 网关 | AI 能力 |
| 部署 | Vercel | 云托管 |
| 监控 | Sentry + PostHog | 错误监控 + 分析 |

---

## 2. 开发环境搭建

### 2.1 前置要求

```bash
# 必需
Node.js >= 20.0.0
npm >= 10.0.0
Git >= 2.0.0

# 推荐
VSCode + 扩展：
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - Prisma
```

### 2.2 首次设置

```bash
# 1. 克隆仓库
git clone git@github.com:hacker20gh/science-flow.git
cd science-flow

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入你的配置

# 4. 生成 Prisma 客户端
npx prisma generate

# 5. 运行数据库迁移（如果有）
npx prisma migrate dev

# 6. 启动开发服务器
npm run dev
```

### 2.3 环变量配置

创建 `.env.local` 文件：

```bash
# 数据库
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# NextAuth
AUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="xxx"

# CCS Gateway (LLM)
CCS_BASE_URL="https://ccs.xxx.com/v1"
CCS_MODEL_CHAT="DeepSeek-V3"
CCS_MODEL_EXTRACTION="Qwen2.5-14B-Instruct"
CCS_MODEL_ANALYSIS="Claude-Sonnet-4"

# Sentry
SENTRY_DSN="https://xxx@sentry.io/xxx"
SENTRY_AUTH_TOKEN="xxx"
SENTRY_ORG="sciflow-term"
SENTRY_PROJECT="javascript-nextjs"
SENTRY_ENABLED="true"

# PostHog
NEXT_PUBLIC_POSTHOG_KEY="phc_xxx"
NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"

# Resend (Email)
RESEND_API_KEY="re_xxx"

# PubMed
NCBI_EMAIL="your@email.com"
```

### 2.4 IDE 配置

**VSCode 设置** (`.vscode/settings.json`)：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

---

## 3. Git 工作流

### 3.1 分支策略

```
main (生产)
  │
  ├── develop (开发主线，可选)
  │     │
  │     ├── feature/xxx (功能分支)
  │     ├── fix/xxx (修复分支)
  │     └── refactor/xxx (重构分支)
  │
  └── release/x.x.x (发布分支，可选)
```

### 3.2 分支命名规范

| 类型 | 前缀 | 示例 |
|------|------|------|
| 新功能 | `feature/` | `feature/paper-search` |
| Bug 修复 | `fix/` | `fix/login-error` |
| 重构 | `refactor/` | `refactor/api-routes` |
| 文档 | `docs/` | `docs/api-guide` |
| 测试 | `test/` | `test/experiment-flow` |
| 热修复 | `hotfix/` | `hotfix/security-patch` |

### 3.3 Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Type 类型：**

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(matrix): add conflict detection` |
| `fix` | Bug 修复 | `fix(auth): handle expired token` |
| `docs` | 文档 | `docs(api): add endpoint examples` |
| `style` | 格式（不影响功能） | `style: fix indentation` |
| `refactor` | 重构 | `refactor(extract): simplify parser` |
| `perf` | 性能优化 | `perf(query): add database index` |
| `test` | 测试 | `test(matrix): add unit tests` |
| `chore` | 构建/工具 | `chore: update dependencies` |
| `ci` | CI/CD | `ci: add Sentry release` |

**示例：**

```bash
# 好的 commit
git commit -m "feat(matrix): implement gap finder for mechanism comparison"
git commit -m "fix(auth): prevent redirect loop on expired session"
git commit -m "docs(readme): add deployment instructions"

# 不好的 commit
git commit -m "update code"
git commit -m "fix bug"
git commit -m "WIP"
```

### 3.4 Pull Request 规范

**PR 标题格式：**

```
<type>(<scope>): <description>
```

**PR 描述模板：**

```markdown
## 变更说明

简要描述这个 PR 做了什么。

## 变更类型

- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构
- [ ] 文档更新
- [ ] 测试

## 测试

- [ ] 本地测试通过
- [ ] TypeScript 检查通过
- [ ] 构建成功

## 截图（如适用）

## 相关 Issue

Closes #xxx
```

---

## 4. 本地开发流程

### 4.1 日常开发循环

```bash
# 1. 确保在最新代码
git checkout main
git pull origin main

# 2. 创建功能分支
git checkout -b feature/new-feature

# 3. 启动开发服务器
npm run dev

# 4. 开发功能（浏览器访问 http://localhost:3000）
# ... 写代码 ...

# 5. 运行检查
npm run type-check    # TypeScript 检查
npm run lint          # ESLint 检查
npm run build         # 构建测试

# 6. 提交代码
git add .
git commit -m "feat(scope): description"

# 7. 推送并创建 PR
git push origin feature/new-feature
```

### 4.2 代码质量检查

```bash
# TypeScript 类型检查
npm run type-check
# 或
npx tsc --noEmit

# ESLint 检查
npm run lint

# ESLint 自动修复
npm run lint:fix

# 构建检查
npm run build
```

### 4.3 数据库操作

```bash
# 查看数据库状态
npx prisma migrate status

# 创建新迁移
npx prisma migrate dev --name add-new-table

# 重置数据库（慎用）
npx prisma migrate reset

# 打开 Prisma Studio（可视化）
npx prisma studio

# 生成 Prisma 客户端
npx prisma generate
```

### 4.4 常用开发命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器（本地测试）
npm run start

# 清理构建缓存
rm -rf .next
npm run build
```

---

## 5. 测试策略

### 5.1 测试金字塔

```
        ┌─────────────┐
        │   E2E 测试   │  ← Playwright（少量关键路径）
        ├─────────────┤
        │  集成测试    │  ← API 路由测试
        ├─────────────┤
        │  单元测试    │  ← 组件 + 工具函数
        └─────────────┘
```

### 5.2 测试命令

```bash
# 运行所有测试
npm run test

# 监听模式
npm run test:watch

# 测试覆盖率
npm run test:coverage

# E2E 测试
npm run test:e2e
```

### 5.3 测试规范

**单元测试示例：**

```typescript
// lib/__tests__/utils.test.ts
import { formatDate } from '../utils'

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2026-01-15')
    expect(formatDate(date)).toBe('2026-01-15')
  })

  it('should handle invalid date', () => {
    expect(formatDate(null)).toBe('')
  })
})
```

**API 测试示例：**

```typescript
// app/api/__tests__/projects.test.ts
import { createMocks } from 'node-mocks-http'
import { GET } from '../projects/route'

describe('/api/projects', () => {
  it('should return projects list', async () => {
    const { req } = createMocks({ method: 'GET' })
    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })
})
```

### 5.4 测试覆盖率目标

| 类型 | 目标 | 当前 |
|------|------|------|
| 单元测试 | 70% | - |
| 集成测试 | 50% | - |
| E2E 测试 | 关键路径 | - |

---

## 6. 部署流程

### 6.1 自动部署（推荐）

```
┌─────────────────────────────────────────────────────────────┐
│  Push to GitHub                                             │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────┐                                        │
│  │ GitHub Actions  │  ← TypeScript 检查 + 构建 + Lint       │
│  └─────────────────┘                                        │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────┐                                        │
│  │    Vercel       │  ← 自动构建 + 部署                      │
│  └─────────────────┘                                        │
│       │                                                     │
│       ▼                                                     │
│  https://sciflow-ai.vercel.app                              │
└─────────────────────────────────────────────────────────────┘
```

**触发条件：**

| 事件 | 环境 | 说明 |
|------|------|------|
| Push to `main` | Production | 自动部署到生产环境 |
| Pull Request | Preview | 自动创建预览部署 |

### 6.2 手动部署

```bash
# 使用部署脚本
./scripts/deploy.sh check       # 部署前检查
./scripts/deploy.sh production  # 部署到生产环境
./scripts/deploy.sh preview     # 创建预览部署
./scripts/deploy.sh status      # 查看部署状态
./scripts/deploy.sh rollback    # 回滚

# 或使用 Vercel CLI
vercel --prod                    # 部署到生产环境
vercel                           # 部署预览版本
vercel rollback                  # 回滚
```

### 6.3 部署检查清单

**部署前：**

- [ ] TypeScript 检查通过：`npx tsc --noEmit`
- [ ] 构建成功：`npm run build`
- [ ] ESLint 无严重错误：`npm run lint`
- [ ] 本地测试通过
- [ ] 代码已提交并推送到 GitHub

**部署后：**

- [ ] 验证部署状态：`vercel ls`
- [ ] 检查应用是否可访问
- [ ] 验证关键功能正常
- [ ] 查看 Sentry 无新错误
- [ ] 检查 PostHog 数据正常

### 6.4 热修复流程

```bash
# 1. 从 main 创建热修复分支
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# 2. 修复问题
# ... 写代码 ...

# 3. 快速检查
npx tsc --noEmit

# 4. 提交并推送
git add .
git commit -m "hotfix: fix critical authentication bug"
git push origin hotfix/critical-bug

# 5. 创建 PR 并合并（或直接推送到 main）
# 如果是紧急修复，可以直接推送到 main：
git checkout main
git merge hotfix/critical-bug
git push origin main

# 6. 清理分支
git branch -d hotfix/critical-bug
git push origin --delete hotfix/critical-bug
```

### 6.5 回滚策略

**自动回滚（Vercel）：**

```bash
# 回滚到上一版本
vercel rollback

# 回滚到指定版本
vercel rollback <deployment-url>
```

**手动回滚：**

```bash
# 1. 查看部署历史
vercel ls

# 2. 找到稳定的版本
# 3. 回滚
vercel rollback <deployment-url>

# 4. 验证
vercel logs --follow
```

**Git 回滚：**

```bash
# 1. 查看提交历史
git log --oneline -10

# 2. 回滚到指定提交
git revert <commit-hash>

# 3. 推送
git push origin main
```

---

## 7. 环境管理

### 7.1 环境类型

| 环境 | 用途 | URL | 数据 |
|------|------|-----|------|
| Development | 本地开发 | localhost:3000 | 开发数据 |
| Preview | PR 预览 | *.vercel.app | 测试数据 |
| Production | 生产环境 | sciflow-ai.vercel.app | 生产数据 |

### 7.2 环境变量管理

**查看环境变量：**

```bash
vercel env ls
```

**添加环境变量：**

```bash
# 通过 CLI
vercel env add VARIABLE_NAME

# 或通过 Vercel 控制台
# https://vercel.com/yshen516-7649s-projects/sciflow-ai/settings/environment-variables
```

**拉取环境变量到本地：**

```bash
vercel env pull .env.local
```

### 7.3 数据库环境隔离

**推荐方案：**

| 环境 | 数据库 |
|------|--------|
| Development | 本地 PostgreSQL 或 Supabase 开发项目 |
| Preview | Supabase 开发项目（共享） |
| Production | Supabase 生产项目（独立） |

**创建 Supabase 开发项目：**

1. 登录 Supabase 控制台
2. 创建新项目（如 `sciflow-dev`）
3. 获取连接字符串
4. 配置到 Vercel Preview 环境变量

---

## 8. 监控与告警

### 8.1 监控架构

```
┌─────────────────────────────────────────────────────────────┐
│                      SciFlow AI                             │
└─────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Sentry     │    │   PostHog    │    │ UptimeRobot  │
│  (错误监控)  │    │  (产品分析)  │    │  (可用性)    │
└──────────────┘    └──────────────┘    └──────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
   错误报警           用户行为分析          宕机告警
```

### 8.2 Sentry 配置

**已配置功能：**

- ✅ 错误自动捕获（前端 + 后端 + API）
- ✅ 性能监控（20% 采样率）
- ✅ Source Map 上传
- ✅ 环境标识（development/production）

**告警规则：**

| 规则 | 条件 | 动作 |
|------|------|------|
| 新错误 | 首次出现 | 邮件通知 |
| 错误频率 | > 10 次/分钟 | 邮件 + Slack |
| 性能问题 | P95 > 3s | 邮件通知 |

**访问 Sentry：**

- URL: https://sentry.io
- 组织: sciflow-term
- 项目: javascript-nextjs

### 8.3 PostHog 配置

**已配置功能：**

- ✅ 页面浏览追踪
- ✅ 自动事件捕获
- ✅ 用户识别
- ✅ 会话回放

**关键事件：**

```typescript
// 在代码中追踪事件
import { trackEvent, sciflowEvents } from '@/lib/analytics'

// 搜索论文
trackEvent(sciflowEvents.paperSearched, { query, source })

// 提取信息
trackEvent(sciflowEvents.paperExtracted, { paperId, method })

// 设计实验
trackEvent(sciflowEvents.experimentDesigned, { type, organism })
```

**访问 PostHog：**

- URL: https://posthog.com
- 项目: SciFlow AI

### 8.4 UptimeRobot 配置（待完成）

**监控项：**

| 名称 | URL | 间隔 | 类型 |
|------|-----|------|------|
| SciFlow 首页 | https://sciflow-ai.vercel.app | 5 分钟 | HTTP |
| API 健康检查 | https://sciflow-ai.vercel.app/api/health | 5 分钟 | HTTP |
| 数据库连接 | - | 5 分钟 | TCP |

**告警渠道：**

- 邮件：your@email.com
- 短信：（可选）
- Slack：（可选）

**设置步骤：**

1. 注册 UptimeRobot 账号
2. 添加监控项
3. 配置告警联系人
4. 验证告警功能

---

## 9. 故障排查

### 9.1 常见问题

**构建失败：**

```bash
# 1. 本地复现
npm run build

# 2. 检查错误信息
# 3. 修复后重新部署
```

**运行时错误：**

```bash
# 1. 查看 Sentry 错误日志
# 2. 查看 Vercel 函数日志
vercel logs --follow

# 3. 本地调试
npm run dev
```

**数据库连接问题：**

```bash
# 1. 检查 Supabase 状态
# https://status.supabase.com

# 2. 验证连接字符串
echo $DATABASE_URL

# 3. 测试连接
npx prisma db pull
```

### 9.2 调试工具

**本地调试：**

```bash
# 启动调试模式
NODE_OPTIONS='--inspect' npm run dev

# 在 Chrome 打开
chrome://inspect
```

**远程调试：**

```bash
# 查看实时日志
vercel logs --follow

# 查看特定函数日志
vercel logs --follow --function=api/projects
```

### 9.3 性能排查

**数据库慢查询：**

1. 登录 Supabase 控制台
2. 查看 SQL 编辑器
3. 分析慢查询日志
4. 添加索引或优化查询

**前端性能：**

1. 打开 Chrome DevTools
2. 查看 Network 面板
3. 分析加载时间
4. 使用 Lighthouse 审计

---

## 10. 团队协作

### 10.1 协作流程

```
开发者 A                    开发者 B
    │                           │
    ▼                           ▼
feature/a-1                 feature/b-1
    │                           │
    ▼                           ▼
  PR #1                       PR #2
    │                           │
    ▼                           ▼
  Review                      Review
    │                           │
    ▼                           ▼
  Merge → main ← Merge
    │
    ▼
自动部署
```

### 10.2 代码审查规范

**审查重点：**

- [ ] 代码逻辑正确
- [ ] 类型安全
- [ ] 错误处理完整
- [ ] 性能影响可接受
- [ ] 测试覆盖充分
- [ ] 文档已更新

**审查流程：**

1. 创建 PR
2. 自动运行 CI 检查
3. Vercel 创建预览部署
4. 团队成员审查代码
5. 测试预览版本
6. 批准并合并

### 10.3 沟通规范

**PR 评论：**

- 使用清晰的语言
- 提供建设性的反馈
- 说明修改原因
- 给出具体建议

**Commit 信息：**

- 遵循 Conventional Commits
- 简洁明了
- 说明做了什么，为什么

---

## 11. 安全规范

### 11.1 代码安全

**禁止：**

- ❌ 硬编码密码或密钥
- ❌ 提交 `.env` 文件
- ❌ 在前端暴露敏感信息
- ❌ 使用未验证的用户输入

**必须：**

- ✅ 使用环境变量存储密钥
- ✅ 验证所有用户输入
- ✅ 使用参数化查询防止 SQL 注入
- ✅ 实施适当的认证和授权

### 11.2 依赖安全

```bash
# 检查安全漏洞
npm audit

# 自动修复
npm audit fix

# 强制修复（慎用）
npm audit fix --force
```

### 11.3 数据安全

- 数据库连接使用 SSL
- 敏感数据加密存储
- 定期备份数据库
- 实施访问控制

---

## 12. 性能优化

### 12.1 前端性能

**优化策略：**

- 使用 Next.js App Router（自动代码分割）
- 图片优化（Next.js Image 组件）
- 字体优化（next/font）
- 静态资源缓存

**监控指标：**

| 指标 | 目标 | 工具 |
|------|------|------|
| FCP | < 1.5s | Lighthouse |
| LCP | < 2.5s | Lighthouse |
| CLS | < 0.1 | Lighthouse |
| TTI | < 3.5s | Lighthouse |

### 12.2 后端性能

**优化策略：**

- 数据库查询优化
- 添加适当的索引
- 使用连接池
- 实施缓存策略

**监控指标：**

| 指标 | 目标 | 工具 |
|------|------|------|
| API 响应时间 | < 200ms | Sentry |
| 数据库查询时间 | < 50ms | Supabase |
| 错误率 | < 0.1% | Sentry |

### 12.3 构建优化

```bash
# 分析构建大小
npm run build -- --analyze

# 清理缓存
rm -rf .next node_modules/.cache
npm run build
```

---

## 13. 附录

### 13.1 常用命令速查

```bash
# 开发
npm run dev                    # 启动开发服务器
npm run build                  # 构建生产版本
npm run start                  # 启动生产服务器

# 代码质量
npm run type-check             # TypeScript 检查
npm run lint                   # ESLint 检查
npm run lint:fix               # ESLint 自动修复

# 数据库
npx prisma generate            # 生成 Prisma 客户端
npx prisma migrate dev         # 创建迁移
npx prisma migrate status      # 查看迁移状态
npx prisma studio              # 打开 Prisma Studio

# 部署
vercel                         # 部署预览版本
vercel --prod                  # 部署到生产环境
vercel ls                      # 查看部署列表
vercel logs                    # 查看日志
vercel rollback                # 回滚

# Git
git status                     # 查看状态
git log --oneline -10          # 查看提交历史
git diff                       # 查看差异
git stash                      # 暂存修改
git stash pop                  # 恢复修改
```

### 13.2 重要链接

| 服务 | URL | 用途 |
|------|-----|------|
| GitHub | https://github.com/hacker20gh/science-flow | 代码仓库 |
| Vercel | https://vercel.com/dashboard | 部署管理 |
| Supabase | https://supabase.com/dashboard | 数据库管理 |
| Sentry | https://sentry.io | 错误监控 |
| PostHog | https://posthog.com | 产品分析 |
| UptimeRobot | https://uptimerobot.com | 可用性监控 |

### 13.3 团队成员

| 角色 | 职责 |
|------|------|
| 开发者 | 编写代码、提交 PR、修复 Bug |
| 审查者 | 审查 PR、测试功能、批准合并 |
| 管理员 | 管理环境变量、配置服务、处理紧急问题 |

### 13.4 版本发布流程

**语义化版本：**

```
MAJOR.MINOR.PATCH

MAJOR: 不兼容的 API 变更
MINOR: 向后兼容的功能添加
PATCH: 向后兼容的 Bug 修复
```

**发布流程：**

```bash
# 1. 更新版本号
npm version minor  # 或 major, patch

# 2. 推送标签
git push origin main --tags

# 3. Vercel 自动部署
```

---

## 快速开始

```bash
# 克隆并设置
git clone git@github.com:hacker20gh/scifience-flow.git
cd science-flow
npm install
cp .env.example .env.local
# 编辑 .env.local

# 启动开发
npm run dev

# 部署检查
./scripts/deploy.sh check

# 部署到生产
./scripts/deploy.sh production
```

---

**最后更新：2026-07-12**
**维护者：SciFlow Team**
