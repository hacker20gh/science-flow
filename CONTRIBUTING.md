# 贡献指南

感谢你对 SciFlow AI 项目的关注！本文档将指导你如何为项目做出贡献。

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发流程](#开发流程)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)
- [问题反馈](#问题反馈)

## 行为准则

本项目采用开放、包容的态度，欢迎所有贡献者。请保持尊重和建设性的沟通。

## 如何贡献

### 贡献类型

- 🐛 **修复 Bug** - 修复已知问题
- ✨ **新功能** - 添加新的功能
- 📝 **文档** - 改进文档
- 🎨 **UI/UX** - 改进界面和用户体验
- ⚡ **性能** - 优化性能
- 🧪 **测试** - 添加或改进测试
- 🔧 **工具** - 改进开发工具和流程

### 第一步：找到或创建 Issue

1. 查看 [Issues](https://github.com/hacker20gh/science-flow/issues) 找到感兴趣的任务
2. 如果没有相关 Issue，先创建一个讨论
3. 在 Issue 中说明你想要贡献

### 第二步：Fork 和克隆

```bash
# Fork 仓库到你的 GitHub 账号

# 克隆你的 Fork
git clone git@github.com:你的用户名/science-flow.git
cd science-flow

# 添加上游仓库
git remote add upstream git@github.com:hacker20gh/science-flow.git
```

### 第三步：创建分支

```bash
# 同步上游代码
git checkout main
git pull upstream main

# 创建功能分支
git checkout -b feature/你的功能名
```

### 第四步：开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 开发功能...
```

### 第五步：测试

```bash
# TypeScript 检查
npx tsc --noEmit

# ESLint 检查
npm run lint

# 构建测试
npm run build
```

### 第六步：提交

```bash
# 添加文件
git add .

# 提交（遵循提交规范）
git commit -m "feat(scope): description"

# 推送到你的 Fork
git push origin feature/你的功能名
```

### 第七步：创建 Pull Request

1. 访问你的 Fork 页面
2. 点击 "New Pull Request"
3. 填写 PR 描述（使用模板）
4. 等待 CI 检查通过
5. 等待代码审查

## 开发流程

### 本地开发

```bash
# 启动开发服务器
npm run dev

# 访问 http://localhost:3000

# 代码修改后自动热重载
```

### 代码检查

```bash
# TypeScript 类型检查
npm run type-check

# ESLint 检查
npm run lint

# ESLint 自动修复
npm run lint:fix

# 构建检查
npm run build
```

### 数据库操作

```bash
# 查看数据库状态
npx prisma migrate status

# 创建迁移
npx prisma migrate dev --name 迁移名

# 打开 Prisma Studio
npx prisma studio
```

## 代码规范

### TypeScript

- 使用严格模式
- 为所有函数和变量添加类型注释
- 避免使用 `any`，使用 `unknown` 或具体类型
- 使用接口定义对象结构

```typescript
// 好的示例
interface User {
  id: string
  name: string
  email: string
}

function getUser(id: string): Promise<User | null> {
  // ...
}

// 不好的示例
function getUser(id: any): any {
  // ...
}
```

### React 组件

- 使用函数式组件和 Hooks
- 组件文件使用 PascalCase 命名
- 使用 TypeScript 定义 Props 类型

```typescript
// 好的示例
interface ButtonProps {
  children: React.ReactNode
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

export function Button({ children, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button onClick={onClick} className={variant}>
      {children}
    </button>
  )
}
```

### 样式

- 使用 Tailwind CSS
- 避免自定义 CSS，优先使用 Tailwind 类
- 使用 shadcn/ui 组件

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名（组件） | PascalCase | `UserProfile.tsx` |
| 文件名（工具） | camelCase | `formatDate.ts` |
| 文件名（样式） | kebab-case | `user-profile.css` |
| 变量 | camelCase | `userName` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 接口 | PascalCase | `UserData` |
| 类型 | PascalCase | `UserType` |
| 函数 | camelCase | `getUserById` |
| 组件 | PascalCase | `UserProfile` |

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Type 类型

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(auth): add OAuth login` |
| `fix` | Bug 修复 | `fix(api): handle null response` |
| `docs` | 文档 | `docs(readme): update setup guide` |
| `style` | 格式（不影响功能） | `style: fix indentation` |
| `refactor` | 重构 | `refactor(extract): simplify parser` |
| `perf` | 性能优化 | `perf(query): add database index` |
| `test` | 测试 | `test(auth): add login tests` |
| `chore` | 构建/工具 | `chore: update dependencies` |
| `ci` | CI/CD | `ci: add Sentry release` |

### 示例

```bash
# 好的提交
git commit -m "feat(matrix): implement gap finder"
git commit -m "fix(auth): prevent redirect loop"
git commit -m "docs(api): add endpoint examples"

# 不好的提交
git commit -m "update code"
git commit -m "fix bug"
git commit -m "WIP"
```

## Pull Request 流程

### PR 标题

遵循提交规范：

```
<type>(<scope>): <description>
```

### PR 描述

使用 PR 模板，包含：

1. **变更说明** - 简要描述做了什么
2. **变更类型** - 选择类型
3. **测试** - 测试情况
4. **截图** - 如有 UI 变更
5. **相关 Issue** - 关联 Issue

### CI 检查

PR 提交后会自动运行：

- ✅ TypeScript 类型检查
- ✅ 项目构建
- ✅ ESLint 检查

**必须所有检查通过才能合并。**

### 代码审查

1. 至少需要一位审查者批准
2. 解决所有审查意见
3. 确保 CI 检查通过
4. 测试预览部署（Vercel 会自动创建）

### 合并

- 使用 "Squash and Merge" 合并 PR
- 合并后删除功能分支

## 问题反馈

### 报告 Bug

使用 [Bug 报告模板](https://github.com/hacker20gh/science-flow/issues/new?template=bug_report.md)：

1. 描述问题
2. 提供复现步骤
3. 提供环境信息
4. 附上错误日志

### 功能请求

使用 [功能请求模板](https://github.com/hacker20gh/science-flow/issues/new?template=feature_request.md)：

1. 描述功能
2. 说明使用场景
3. 提供替代方案

### 提问

- 先搜索已有的 Issue
- 使用清晰的标题
- 提供足够的上下文
- 保持礼貌和耐心

## 常见问题

### Q: 如何同步上游代码？

```bash
git checkout main
git pull upstream main
git checkout feature/你的分支
git merge main
```

### Q: 如何解决合并冲突？

```bash
git checkout main
git pull upstream main
git checkout feature/你的分支
git merge main
# 解决冲突后
git add .
git commit -m "merge: resolve conflicts"
```

### Q: 如何撤销提交？

```bash
# 撤销最后一次提交（保留修改）
git reset --soft HEAD~1

# 撤销最后一次提交（丢弃修改）
git reset --hard HEAD~1
```

### Q: 如何更新 PR？

```bash
# 修改代码后
git add .
git commit -m "fix: address review comments"
git push origin feature/你的分支
# PR 会自动更新
```

## 联系方式

- Issue: https://github.com/hacker20gh/science-flow/issues
- Discussion: https://github.com/hacker20gh/science-flow/discussions

## 致谢

感谢所有为 SciFlow AI 做出贡献的人！

---

**最后更新：2026-07-12**
