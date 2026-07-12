#!/bin/bash
# SciFlow AI 部署辅助脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "ℹ $1"; }

# 检查命令是否存在
check_command() {
  if ! command -v "$1" &> /dev/null; then
    print_error "$1 未安装"
    return 1
  fi
}

# 部署前检查
pre_deploy_check() {
  print_info "运行部署前检查..."

  # 1. TypeScript 检查
  print_info "TypeScript 类型检查..."
  if npx tsc --noEmit; then
    print_success "TypeScript 检查通过"
  else
    print_error "TypeScript 检查失败"
    exit 1
  fi

  # 2. 构建检查
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
  print_info "部署到生产环境..."

  # 运行部署前检查
  pre_deploy_check

  # 推送到 GitHub（触发 Vercel 自动部署）
  print_info "推送到 GitHub..."
  git push origin main

  print_success "代码已推送，Vercel 将自动部署"
  print_info "查看部署状态: https://vercel.com/dashboard"
}

# 创建预览部署
deploy_preview() {
  local branch_name=$(git branch --show-current)

  if [ "$branch_name" = "main" ] || [ "$branch_name" = "master" ]; then
    print_error "不能在主分支创建预览部署，请先创建功能分支"
    exit 1
  fi

  print_info "创建预览部署..."

  # 运行部署前检查
  pre_deploy_check

  # 推送分支
  print_info "推送到 GitHub..."
  git push origin "$branch_name"

  print_success "代码已推送，Vercel 将创建预览部署"
  print_info "在 GitHub 创建 Pull Request 以查看预览链接"
}

# 查看部署状态
status() {
  print_info "部署状态:"
  vercel ls

  echo ""
  print_info "最近日志:"
  vercel logs sciflow-ai.vercel.app --limit 10
}

# 回滚部署
rollback() {
  print_warning "回滚到上一版本..."
  vercel rollback
  print_success "回滚完成"
}

# 查看环境变量
env_list() {
  print_info "环境变量:"
  vercel env ls
}

# 本地开发
dev() {
  print_info "启动本地开发服务器..."
  npm run dev
}

# 显示帮助
help() {
  echo "SciFlow AI 部署辅助脚本"
  echo ""
  echo "用法: ./scripts/deploy.sh [命令]"
  echo ""
  echo "命令:"
  echo "  check       运行部署前检查"
  echo "  production  部署到生产环境"
  echo "  preview     创建预览部署"
  echo "  status      查看部署状态"
  echo "  rollback    回滚到上一版本"
  echo "  env         查看环境变量"
  echo "  dev         启动本地开发服务器"
  echo "  help        显示此帮助信息"
  echo ""
  echo "示例:"
  echo "  ./scripts/deploy.sh check       # 部署前检查"
  echo "  ./scripts/deploy.sh production  # 部署到生产环境"
  echo "  ./scripts/deploy.sh preview     # 创建预览部署"
}

# 主函数
main() {
  # 检查依赖
  check_command "git"
  check_command "npm"
  check_command "vercel"

  # 解析命令
  case "${1:-help}" in
    check)
      pre_deploy_check
      ;;
    production|prod)
      deploy_production
      ;;
    preview)
      deploy_preview
      ;;
    status)
      status
      ;;
    rollback)
      rollback
      ;;
    env)
      env_list
      ;;
    dev)
      dev
      ;;
    help|*)
      help
      ;;
  esac
}

# 运行主函数
main "$@"
