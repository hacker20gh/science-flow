# SciFlow AI — Supabase 设置指南

## 快速开始（5 分钟）

### 第 1 步：创建 Supabase 项目

1. 打开 [supabase.com](https://supabase.com)，注册/登录
2. 点击 **New Project**
3. 填写：
   - **Organization**: 选择或创建
   - **Project name**: `sciflow-ai`
   - **Database password**: 设置一个强密码（记住它）
   - **Region**: 选择离你最近的区域（如 `Northeast Asia - Tokyo`）
4. 点击 **Create new project**，等待 1-2 分钟

### 第 2 步：获取连接信息

进入项目后，点击左侧 **Settings** → **API**：

复制以下信息：

| 配置项 | 值 |
|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG...` (anon public key) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` (service_role key) |

然后进入 **Settings** → **Database** → **Connection string** → **URI**：

复制 `URI` 格式的连接串，替换密码后得到：
```
postgresql://postgres.[项目ref]:[你的密码]@aws-0-[区域].pooler.supabase.com:6543/postgres
```

### 第 3 步：填入环境变量

在项目根目录创建 `.env.local`（或编辑 `.env`）：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# 数据库（从 Settings → Database → Connection string 获取）
DATABASE_URL="postgresql://postgres.xxxxx:[密码]@aws-0-[区域].pooler.supabase.com:6543/postgres"

# LLM (CCS)
CCS_BASE_URL="http://127.0.0.1:15721/v1"

# PubMed
NCBI_EMAIL="your@email.com"
```

### 第 4 步：运行数据库迁移

**方法 A：Supabase Dashboard SQL Editor（推荐）**

1. 在 Supabase Dashboard 点击左侧 **SQL Editor**
2. 点击 **New query**
3. 复制 `supabase/migrations/001_init.sql` 的内容粘贴进去
4. 点击 **Run** 执行

### 第 5 步：重启开发服务器

```bash
npm run dev
```

访问 http://localhost:3000 → 应该跳转到登录页面。

---

## 验证清单

- [ ] 登录页面正常显示
- [ ] 注册账号后收到验证邮件
- [ ] 点击验证链接后自动登录
- [ ] 登录后能看到项目列表（空）
- [ ] 创建项目后数据保存到数据库
- [ ] 刷新页面数据不丢失
- [ ] AI 功能（搜索/提取/实验设计）正常工作

---

## 常见问题

### Q: "Invalid API key" 错误
A: 检查 `.env.local` 中的 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 是否正确复制。

### Q: 数据库连接失败
A: 确保 `DATABASE_URL` 使用的是 **Transaction mode** 端口（6543），不是 Session mode（5432）。

### Q: 登录后没有跳转
A: 检查 `middleware.ts` 是否存在且正确导出了 `middleware` 函数。

### Q: 注册没有收到邮件
A: Supabase 免费版有邮件限制。可以在 Dashboard → Authentication → Providers → Email 中禁用 "Confirm email" 进行测试。

### Q: 免费额度够用吗？
A: Supabase 免费层提供：
- 500MB 数据库
- 1GB 文件存储
- 50,000 月活用户
- 足够开发和早期使用

---

## 数据库表结构

执行迁移后会创建以下 9 张表：

| 表名 | 说明 |
|------|------|
| `User` | 用户信息（自动通过 Auth 创建） |
| `Project` | 科研项目 |
| `Paper` | 文献 |
| `Extraction` | 文献提取结果 |
| `Hypothesis` | 假设 |
| `Experiment` | 实验 |
| `ExperimentData` | 实验数据文件 |
| `TimelineEvent` | 时间线事件 |
| `Manuscript` | 论文草稿 |

所有表都通过外键关联到 `Project`，`Project` 关联到 `User`。
