# SciFlow AI — Loop Configuration

> Stop prompting. Design the loop.

## Active Patterns

| Pattern      | Cadence | Level      | Status  |
|--------------|---------|------------|---------|
| Daily Triage | 1d      | L1 report  | ✅ 运行中 |
| PR Babysitter| —       | —          | 🔜 等待 CI 就绪 |

## Daily Triage 配置

```
/loop 1d Run $loop-triage. Read STATE.md. Merge findings into High Priority and Watch List. Update Last run. Do not edit code.
```

- **级别**: L1 report-only（不自动修改代码）
- **Token 预算**: ~50k/run（扫描 + 报告）
- **每日上限**: 100k tokens

## PR Babysitter 配置（Phase 2，待启用）

```
/loop 5m For each open PR: triage CI and reviews. Propose minimal fixes in worktree. Verifier agent must approve. Update pr-babysitter-state.md. Max 3 attempts per PR.
```

- **前提**: GitHub Actions CI 就绪（`tsc --noEmit` + `eslint`）
- **级别**: L2 assisted fixes
- **Token 预算**: ~250k/run（worktree + fix + verify）

## Limits

- Daily Triage: report-only，不自动修改代码
- Max fix attempts per PR: 3（Phase 2）
- Auto-merge: **disabled**（永不自动合并）
- 每次循环前必须读取 `loop-constraints.md`

## Human Gates（必须人类决策）

- 数据库 schema 变更（Prisma migration）
- 认证/授权相关代码（`app/(auth)/`、next-auth）
- Supabase 配置变更
- LLM prompt 模板修改
- 环境变量 / 密钥相关
- 安全相关变更

## Phased Rollout

| Week | Level | 做什么 |
|------|-------|--------|
| Week 1 | L1 report | Daily Triage 只报告，人类决策 |
| Week 2+ | L1 + review | 在报告基础上，对简单问题提出修复建议 |
| Phase 2 | L2 assisted | 接入 PR Babysitter + CI |
| Phase 3 | L3 unattended | 全自动（仅限低风险变更） |
