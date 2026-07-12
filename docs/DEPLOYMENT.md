# SciFlow AI 部署指南

## 架构概览

```
开发者 → GitHub → Vercel (自动构建 + 部署) → 用户访问
              ↓
        GitHub Actions (CI: 类型检查 + 构建 + Lint)
```

---

## 自动部署流程

### Push 触发（生产环境）

```bash
# 1. 修改代码
# 2. 提交
git add .
git commit -m "feat: 新功能描述"
git push origin main

# 3. 自动发生：
#    - GitHub Actions 运行 CI 检查
#    - Vercel 自动构建 + 部署到生产环境
#    - https://sciflow-ai.vercel.app 自动更新
```

### PR 触发（预览环境）

```bash
# 1. 创建功能分支
git checkout -b feat/new-feature

# 2. 修改代码并推送
git add .
git commit -m "feat: 新功能"
git push origin feat/new-feature

# 3. 在 GitHub 创建 Pull Request
# 4. 自动发生：
#    - GitHub Actions 运行 CI 检查
#    - Vercel 创建预览部署（独立 URL）
#    - PR 页面显示预览链接
```

---

## 环境变量管理

### 已配置的变量

| 变量名 | 用途 | 环境 |
|--------|------|------|
| DATABASE_URL | Supabase 数据库连接 | Production |
| AUTH_SECRET | NextAuth 认证密钥 | Preview, Production |
| NEXT_PUBLIC_SUPABASE_URL | Supabase 项目 URL | Preview, Production |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase 匿名密钥 | Preview, Production |
| CCS_BASE_URL | LLM 网关地址 | Preview, Production |
| CCS_MODEL_CHAT | 对话模型 | Preview, Production |
| CCS_MODEL_EXTRACTION | 提取模型 | Preview, Production |
| CCS_MODEL_ANALYSIS | 分析模型 | Preview, Production |
| SENTRY_DSN | Sentry 错误上报 | Preview, Production |
| SENTRY_AUTH_TOKEN | Sentry API Token | Preview, Production |
| SENTRY_ORG | Sentry 组织 | Preview, Production |
| SENTRY_PROJECT | Sentry 项目 | Preview, Production |
| NEXT_PUBLIC_POSTHOG_KEY | PostHog 项目密钥 | Preview, Production |
| NEXT_PUBLIC_POSTHOG_HOST | PostHog 服务地址 | Preview, Production |
| RESEND_API_KEY | Resend 邮件服务密钥 | Preview, Production |
| NCBI_EMAIL | PubMed API 邮箱 | Preview, Production |

### 添加新变量

```bash
# 通过 CLI
vercel env add VARIABLE_NAME

# 或通过 Vercel 控制台
# https://vercel.com/yshen516-7649s-projects/sciflow-ai/settings/environment-variables
```

---

## 部署检查清单

### 首次部署前

- [x] 代码推送到 GitHub
- [x] Vercel 项目已创建
- [x] 环境变量已配置
- [x] 部署保护已禁用
- [x] GitHub Actions CI 已配置

### 每次部署前

- [ ] 本地运行 `npx tsc --noEmit` 通过
- [ ] 本地运行 `npm run build` 通过
- [ ] 代码已推送到 GitHub

---

## 监控与告警

### Sentry（错误监控）

- 自动捕获前端/后端错误
- 生产环境 20% 性能采样
- 访问：https://sentry.io

### PostHog（产品分析）

- 用户行为追踪
- 会话回放
- 访问：https://posthog.com

### UptimeRobot（待配置）

- 每 5 分钟检查网站可用性
- 宕机时发送邮件/短信告警
- 访问：https://uptimerobot.com

---

## 常用命令

```bash
# 查看部署状态
vercel ls

# 查看部署日志
vercel logs sciflow-ai.vercel.app

# 手动触发部署
vercel --prod

# 回滚到上一版本
vercel rollback

# 查看环境变量
vercel env ls

# 本地开发
npm run dev

# 本地构建测试
npm run build
npm run start
```

---

## 故障排查

### 部署失败

1. 检查 Vercel 构建日志：`vercel logs`
2. 本地复现：`npm run build`
3. 检查环境变量是否完整

### 应用报错

1. 查看 Sentry 错误日志
2. 检查 Vercel 函数日志：`vercel logs --follow`
3. 本地调试：`npm run dev`

### 数据库问题

1. 检查 Supabase 控制台
2. 验证 DATABASE_URL 是否正确
3. 运行 Prisma 迁移：`npx prisma migrate deploy`

---

## 自定义域名（可选）

### 购买域名

1. 阿里云/腾讯云购买域名（如 sciflow.cn）
2. 完成域名备案（国内域名必须）

### 绑定到 Vercel

1. Vercel 控制台 → Settings → Domains
2. 添加域名
3. 配置 DNS 记录（Vercel 会提供）

### 好处

- 绕过 vercel.app 域名封锁
- 更专业的品牌形象
- 可配置 SSL 证书

---

## 团队协作

### 添加团队成员

1. Vercel 控制台 → Settings → Members
2. 邀请成员（需要 Vercel 账号）
3. 设置权限（Viewer/Developer/Owner）

### 代码审查流程

1. 创建功能分支
2. 提交 Pull Request
3. GitHub Actions 自动检查
4. Vercel 自动创建预览部署
5. 团队成员审查代码 + 测试预览
6. 合并后自动部署到生产环境

---

## 成本说明

### Vercel Hobby Plan（当前）

- 价格：免费
- 限制：
  - 1 个并发构建
  - 100GB 带宽/月
  - 个人项目 only

### 升级到 Pro Plan

- 价格：$20/月/成员
- 好处：
  - 更多并发构建
  - 1TB 带宽/月
  - 团队协作
  - 优先支持

---

## 下一步

1. **配置自定义域名**（解决国内访问问题）
2. **设置 UptimeRobot 监控**
3. **连接 Sentry 到 GitHub**（自动关联错误到代码）
4. **配置 Vercel Git 集成**（自动部署已启用，确认 PR 预览也启用）
