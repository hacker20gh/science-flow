---
name: loop-triage
description: >
  Scan SciFlow AI project health: TypeScript compilation, lint,
  TODO/FIXME markers, stale imports, and uncommitted changes.
  Report-only — never edits code. Use in Daily Triage loops.
user_invocable: true
---

# Daily Triage — SciFlow AI

每次运行前先读取 `loop-constraints.md`，确认红线规则。

## Scan Checklist（按顺序执行）

1. **读取约束** — `cat loop-constraints.md`，确认红线
2. **读取状态** — `cat STATE.md`，了解上次运行状态
3. **TypeScript 编译** — `npx tsc --noEmit 2>&1`，记录所有错误
4. **ESLint** — `npx eslint . --max-warnings=100 2>&1`，记录警告
5. **TODO/FIXME** — 搜索项目中的 TODO、FIXME、HACK、XXX 标记（排除 node_modules、.next、dist）
6. **Git 状态** — `git status --short` 检查未提交的文件
7. **依赖健康** — `npm outdated 2>&1`（仅报告，不更新）
8. **构建检查** — `npx next build 2>&1 | tail -20`（如果时间允许）

## 输出格式

### 🏥 项目健康报告

```
### 编译状态
- TypeScript: ✅ clean | ❌ N errors
- ESLint: ✅ clean | ⚠️ N warnings
- Build: ✅ success | ❌ failed

### 发现事项（按优先级）

#### 🔴 High（阻断性问题）
- [具体问题描述] — `file.ts:123`

#### 🟡 Medium（应关注）
- [具体问题描述] — `file.ts:456`

#### 🔵 Low（整洁度）
- TODO/FIXME 统计: N 个
- 未提交文件: N 个

### 建议行动
- 对每个 High 事项给出具体修复建议
- 对 Medium 事项判断是否需要立即处理
```

## Rules

- **Report-only**：绝不修改代码、绝不 git commit/push
- 附带具体文件路径和行号
- 按影响范围排序，不按字母排序
- 如果上次运行和本次发现相同问题，标记为"持续存在"
- 运行结束后更新 `STATE.md`（Last run 时间、High Priority、Watch List）
- 运行结束后在 `loop-run-log.md` 追加一行记录
