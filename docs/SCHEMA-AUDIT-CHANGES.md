# 数据库 Schema 变更建议 — 用户数据隔离

> ⚠️ 以下变更需要你审批才能执行。loop-constraints.md 禁止自动修改 Prisma Schema。

## 变更 1：UserSetting 添加 userId（🔴 致命级）

### 问题
当前 `UserSetting` 使用全局唯一 `key`，没有 `userId` 字段。所有用户共享同一个设置：
- 用户 A 保存 LLM 配置 → 覆盖用户 B 的配置
- Zotero API Key 全局共享，任何人可读取他人密钥

### 建议 Schema 变更

```prisma
model UserSetting {
  id        String   @id @default(cuid())
  userId    String                          // 新增
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)  // 新增
  key       String
  value     Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@unique([userId, key])                   // 改为用户+key 联合唯一
  @@index([userId])                         // 新增索引
}
```

### User model 新增关联
```prisma
model User {
  // ... 现有字段 ...
  settings UserSetting[]   // 新增
}
```

### 迁移步骤
1. `prisma migrate dev --name add-userid-to-user-setting`
2. 编写数据迁移脚本：将现有 global settings 复制给每个用户
3. 修改 `app/api/settings/route.ts`：查询/写入时加 `userId` 条件
4. 修改 `lib/academic/zotero.ts` 或调用方：查询 Zotero API Key 时加 `userId`

---

## 变更 2：TokenUsage 添加 userId（🟡 中危级）

### 问题
当前 `TokenUsage` 没有 `userId`，无法：
- 按用户追踪 LLM 用量
- 实现用户级配额限制
- 检测异常用量（费用攻击）

### 建议 Schema 变更

```prisma
model TokenUsage {
  id           String   @id @default(cuid())
  userId       String?                         // 新增（可选，兼容匿名调用）
  user         User?    @relation(fields: [userId], references: [id], onDelete: SetNull)  // 新增
  feature      String
  model        String
  inputTokens  Int
  outputTokens Int
  cachedTokens Int      @default(0)
  durationMs   Int      @default(0)
  isRetry      Boolean  @default(false)
  createdAt    DateTime @default(now())

  @@index([userId, createdAt])                 // 新增索引
  @@index([feature, createdAt])
  @@index([createdAt])
}
```

### User model 新增关联
```prisma
model User {
  // ... 现有字段 ...
  tokenUsage TokenUsage[]   // 新增
}
```

### 迁移步骤
1. `prisma migrate dev --name add-userid-to-token-usage`
2. 修改 `lib/token-tracker.ts`：`trackTokenUsage` 接受可选 `userId` 参数
3. 所有调用 `trackTokenUsage` 的地方传入 `userId`

---

## 执行顺序

1. **先执行代码层修复**（已完成 — middleware + API routes auth 检查）
2. **确认代码层修复无问题后**，再执行 Schema 变更
3. Schema 变更前先在本地测试迁移，确认无数据丢失
