# SciFlow AI — Loop State

> 循环每次运行后更新此文件。人类和循环都依赖它了解项目当前状态。

Last run: 2026-07-16T23:30:00+08:00
Last run duration: ~45min
Last run tokens: ~500k (安全审计 + 修复)

## High Priority（循环正在处理或等待人类）

（暂无 — 安全审计完成，所有 P0/P1 问题已修复）

## Watch List（需关注但不紧急）

- `UserSetting` 表旧数据已废弃（代码改用 `User.llmConfig`），可考虑清理
- `TokenUsage.userId` 目前为 nullable，需要在 `trackTokenUsage` 调用处传入 userId 才能生效
- 文件上传路由 (`upload/route.ts`) 仍使用本地文件系统存储，Vercel 部署不可用

## Resolved (last 7d)

- 2026-07-16: **全面安全审计** — 4 个致命 + 8 个高危 + 6 个中危问题
  - 修复: middleware.ts 框架级路由保护
  - 修复: 35+ API 路由添加 auth + ownership 验证
  - 修复: UserSetting 全局共享 → User.llmConfig 用户级存储
  - 修复: SSRF 防护、密码策略、demo user 后门
  - Schema: UserSetting.userId + TokenUsage.userId 已添加

## Noise (ignored this run)

（暂无）

## Run Critique（每次运行后填写）

- False positives: —
- High-noise items: —
- Should deprioritize: —
- Suggested adjustment for next run: —
