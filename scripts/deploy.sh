#!/bin/bash
# SciFlow AI 部署辅助脚本
# 用法: ./scripts/deploy.sh [命令]

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_header() { echo -e "\n${BLUE}══════════════════════════════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}\n"; }

# 检查命令是否存在
check_command() {
  if ! command -v "$1" &> /dev/null; then
    print_error "$1 未安装"
    return 1
  fi
}

# 检查是否在 Git 仓库中
check_git_repo() {
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "当前目录不是 Git 仓库"
    exit 1
  fi
}

# 检查是否有未提交的更改
check_uncommitted_changes() {
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    print_warning "有未提交的更改"
    git status --short
    echo ""
    read -p "是否继续？(y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      print_info "操作已取消"
      exit 1
    fi
  fi
}

# 部署前检查
pre_deploy_check() {
  print_header "部署前检查"

  # 1. TypeScript 检查
  print_info "TypeScript 类型检查..."
  if npx tsc --noEmit; then
    print_success "TypeScript 检查通过"
  else
    print_error "TypeScript 检查失败"
    exit 1
  fi

  # 2. ESLint 检查
  print_info "ESLint 检查..."
  if npm run lint; then
    print_success "ESLint 检查通过"
  else
    print_warning "ESLint 有警告，继续部署"
  fi

  # 3. 构建检查
  print_info "构建检查..."
  if npm run build; then
    print_success "构建成功"
  else
    print_error "构建失败"
    exit 1
  fi

  print_success "所有检查通过，可以部署"
}

# 部署到生产环境
deploy_production() {
  print_header "部署到生产环境"

  # 检查 Git 状态
  check_git_repo
  check_uncommitted_changes

  # 运行部署前检查
  pre_deploy_check

  # 推送到 GitHub（触发 Vercel 自动部署）
  print_info "推送到 GitHub..."
  git push origin main

  print_success "代码已推送，Vercel 将自动部署"
  print_info "查看部署状态: https://vercel.com/dashboard"
  print_info "预计 1-2 分钟完成部署"
}

# 创建预览部署
deploy_preview() {
  local branch_name=$(git branch --show-current)

  if [ "$branch_name" = "main" ] || [ "$branch_name" = "master" ]; then
    print_error "不能在主分支创建预览部署，请先创建功能分支"
    print_info "示例: git checkout -b feature/your-feature"
    exit 1
  fi

  print_header "创建预览部署"

  # 检查 Git 状态
  check_git_repo
  check_uncommitted_changes

  # 运行部署前检查
  pre_deploy_check

  # 推送分支
  print_info "推送到 GitHub..."
  git push origin "$branch_name"

  print_success "代码已推送，Vercel 将创建预览部署"
  print_info "在 GitHub 创建 Pull Request 以查看预览链接"
  print_info "PR 创建后，Vercel 会自动添加预览 URL"
}

# 首次设置
setup() {
  print_header "首次设置"

  # 检查依赖
  print_info "检查依赖..."
  check_command "git"
  check_command "npm"
  check_command "node"

  # 安装依赖
  print_info "安装依赖..."
  npm install

  # 生成 Prisma 客户端
  print_info "生成 Prisma 客户端..."
  npx prisma generate

  # 检查环境变量
  print_info "检查环境变量..."
  if [ -f .env.local ]; then
    print_success ".env.local 文件存在"
  else
    print_warning ".env.local 文件不存在"
    print_info "请复制 .env.example 到 .env.local 并填入你的配置"
  fi

  # 检查 Vercel CLI
  if ! command -v vercel &> /dev/null; then
    print_warning "Vercel CLI 未安装"
    read -p "是否安装 Vercel CLI？(y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      npm install -g vercel
    fi
  fi

  print_success "设置完成"
  print_info "运行 'npm run dev' 启动开发服务器"
}

# 查看部署状态
status() {
  print_header "部署状态"

  print_info "Vercel 部署列表:"
  npx vercel ls 2>/dev/null || print_warning "无法获取部署列表（可能未登录 Vercel）"

  echo ""
  print_info "最近日志:"
  npx vercel logs --limit 10 2>/dev/null || print_warning "无法获取日志"
}

# 查看详细状态
status_detailed() {
  print_header "详细状态"

  # Git 状态
  print_info "Git 状态:"
  git status --short
  echo ""

  # 最近提交
  print_info "最近提交:"
  git log --oneline -5
  echo ""

  # 分支信息
  print_info "当前分支:"
  git branch -v
  echo ""

  # Vercel 状态
  print_info "Vercel 部署:"
  npx vercel ls 2>/dev/null || print_warning "无法获取部署列表"
}

# 回滚部署
rollback() {
  print_header "回滚部署"

  print_warning "这将回滚到上一版本"
  read -p "确认回滚？(y/N) " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    npx vercel rollback
    print_success "回滚完成"
  else
    print_info "回滚已取消"
  fi
}

# 查看环境变量
env_list() {
  print_header "环境变量"

  npx vercel env ls 2>/dev/null || print_warning "无法获取环境变量（可能未登录 Vercel）"
}

# 添加环境变量
env_add() {
  local var_name=$1

  if [ -z "$var_name" ]; then
    print_error "请提供环境变量名称"
    print_info "用法: ./scripts/deploy.sh env-add VARIABLE_NAME"
    exit 1
  fi

  print_header "添加环境变量: $var_name"

  npx vercel env add "$var_name"
}

# 本地开发
dev() {
  print_header "启动本地开发服务器"

  print_info "启动开发服务器..."
  print_info "访问 http://localhost:3000"
  print_info "按 Ctrl+C 停止服务器"
  echo ""

  npm run dev
}

# 构建测试
build() {
  print_header "构建测试"

  print_info "构建生产版本..."
  npm run build

  print_success "构建成功"
}

# 清理缓存
clean() {
  print_header "清理缓存"

  print_info "清理 Next.js 缓存..."
  rm -rf .next

  print_info "清理 node_modules 缓存..."
  rm -rf node_modules/.cache

  print_success "缓存已清理"
}

# 重置环境
reset() {
  print_header "重置环境"

  print_warning "这将删除 node_modules 和 .next"
  read -p "确认重置？(y/N) " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "删除 node_modules..."
    rm -rf node_modules

    print_info "删除 .next..."
    rm -rf .next

    print_info "重新安装依赖..."
    npm install

    print_success "环境已重置"
  else
    print_info "重置已取消"
  fi
}

# 数据库操作
db_status() {
  print_header "数据库状态"

  npx prisma migrate status
}

db_migrate() {
  local migration_name=$1

  if [ -z "$migration_name" ]; then
    print_error "请提供迁移名称"
    print_info "用法: ./scripts/deploy.sh db-migrate 'add-new-table'"
    exit 1
  fi

  print_header "创建数据库迁移: $migration_name"

  npx prisma migrate dev --name "$migration_name"

  print_success "迁移创建成功"
}

db_studio() {
  print_header "打开 Prisma Studio"

  print_info "正在打开 Prisma Studio..."
  print_info "访问 http://localhost:5555"
  print_info "按 Ctrl+C 停止"

  npx prisma studio
}

# 显示帮助
help() {
  echo -e "${BLUE}SciFlow AI 部署辅助脚本${NC}"
  echo ""
  echo "用法: ./scripts/deploy.sh [命令]"
  echo ""
  echo -e "${GREEN}设置命令:${NC}"
  echo "  setup           首次设置项目"
  echo ""
  echo -e "${GREEN}开发命令:${NC}"
  echo "  dev             启动本地开发服务器"
  echo "  build           构建测试"
  echo "  clean           清理缓存"
  echo "  reset           重置环境（删除 node_modules 和 .next）"
  echo ""
  echo -e "${GREEN}检查命令:${NC}"
  echo "  check           运行部署前检查"
  echo "  status          查看部署状态"
  echo "  status-detailed 查看详细状态（Git + Vercel）"
  echo ""
  echo -e "${GREEN}部署命令:${NC}"
  echo "  production      部署到生产环境"
  echo "  preview         创建预览部署"
  echo "  rollback        回滚到上一版本"
  echo ""
  echo -e "${GREEN}环境变量命令:${NC}"
  echo "  env             查看环境变量"
  echo "  env-add <name>  添加环境变量"
  echo ""
  echo -e "${GREEN}数据库命令:${NC}"
  echo "  db-status       查看数据库迁移状态"
  echo "  db-migrate <name> 创建数据库迁移"
  echo "  db-studio       打开 Prisma Studio"
  echo ""
  echo -e "${GREEN}示例:${NC}"
  echo "  ./scripts/deploy.sh setup           # 首次设置"
  echo "  ./scripts/deploy.sh dev             # 启动开发"
  echo "  ./scripts/deploy.sh check           # 部署前检查"
  echo "  ./scripts/deploy.sh production      # 部署到生产"
  echo "  ./scripts/deploy.sh preview         # 预览部署"
  echo "  ./scripts/deploy.sh status          # 查看状态"
  echo ""
}

# 主函数
main() {
  # 检查依赖
  check_command "git" || exit 1
  check_command "npm" || exit 1

  # 解析命令
  case "${1:-help}" in
    setup)
      setup
      ;;
    check)
      pre_deploy_check
      ;;
    production|prod|deploy)
      deploy_production
      ;;
    preview|pr)
      deploy_preview
      ;;
    status)
      status
      ;;
    status-detailed|sd)
      status_detailed
      ;;
    rollback)
      rollback
      ;;
    env)
      env_list
      ;;
    env-add)
      env_add "$2"
      ;;
    dev)
      dev
      ;;
    build)
      build
      ;;
    clean)
      clean
      ;;
    reset)
      reset
      ;;
    db-status)
      db_status
      ;;
    db-migrate)
      db_migrate "$2"
      ;;
    db-studio)
      db_studio
      ;;
    help|*)
      help
      ;;
  esac
}

# 运行主函数
main "$@"
