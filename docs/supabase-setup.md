# SciFlow AI — Supabase 设置指南

## 第一步：创建 Supabase 项目

1. 打开 [https://supabase.com](https://supabase.com)，注册/登录
2. 点击 "New Project"
3. 填写：
   - **Name**: `sciflow-ai`
   - **Database Password**: 设一个强密码（记住它）
   - **Region**: 选离你最近的（如 Southeast Asia）
4. 点击 "Create new project"，等待 1-2 分钟

## 第二步：获取 API Key

进入项目后，点击左侧 **Settings → API**：

- **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
- **anon / public key**: `eyJhbGciOi...`（用于浏览器端）
- **service_role key**: `eyJhbGciOi...`（用于服务端，不要暴露给前端）

## 第三步：初始化数据库

1. 点击左侧 **SQL Editor**
2. 点击 **New query**
3. 复制 `supabase/migrations/001_init.sql` 的内容
4. 粘贴到编辑器
5. 点击 **Run** 执行

## 第四步：配置环境变量

在项目根目录创建 `.env.local` 文件：

```env
# Supabase
DATABASE_URL="postgresql://postgres:你的密码@db.xxxxx.supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOi..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."

# LLM (CCS)
CCS_BASE_URL="http://localhost:3001/v1"
CCS_API_KEY="你的CCS密钥"
CCS_MODEL_EXTRACTION="sciflow-extraction"
CCS_MODEL_CHAT="sciflow-chat"
CCS_MODEL_ANALYSIS="sciflow-analysis"

# PubMed
NCBI_EMAIL="your@email.com"
```

## 第五步：验证连接

```bash
npm run dev
# 访问 http://localhost:3000
# 如果没有报错，说明 Supabase 连接成功
```

## 常见问题

### Q: 我还没有 Supabase 账号怎么办？
A: 直接去 supabase.com 注册，免费额度足够开发阶段使用。

### Q: service_role key 安全吗？
A: 这个 key 只在服务端（API Routes）使用，不会暴露给浏览器。但不要提交到 Git。

### Q: 免费额度够用吗？
A: Supabase 免费层提供：
- 500MB 数据库
- 1GB 文件存储
- 50,000 月活用户
- 足够开发和早期使用
