# Loop Constraints — SciFlow AI

> 循环每次运行前必须读取此文件。违反任何约束 = 立即停止 + escalate to human。

## 硬性约束（不可违反）

1. **不要自动 git push** — 所有推送需人类确认
2. **不要自动 git commit** — commit message 需人类确认（L1 阶段）
3. **不要修改 Prisma schema** — 数据库变更需人类审批
4. **不要修改 .env 或任何环境变量** — 涉及密钥安全
5. **不要修改认证流程** — `app/(auth)/`、next-auth 配置、middleware 中的认证逻辑
6. **不要修改 Supabase 配置** — 包括 RLS policies、Storage buckets
7. **不要自动合并 PR** — auto-merge 永久禁用
8. **不要修改 LLM prompt 模板** — `lib/llm/prompts/` 目录变更需人类审批
9. **不要删除文件** — 只能新增或修改，删除需人类确认

## 软性约束（应遵守，特殊情况可 escalate 后突破）

1. 单次循环的代码变更不超过 50 行
2. 不要同时修改超过 3 个文件
3. TypeScript 编译必须通过（`npx tsc --noEmit`）
4. 循环产出的变更必须通过 verifier agent 审查
5. 遇到不确定的问题，escalate to human，不要猜测

## Denylist 路径（循环不得修改）

```
prisma/schema.prisma
.env*
app/(auth)/**
next.config.*
middleware.ts
lib/llm/prompts/**
```
