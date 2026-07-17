@echo off
chcp 65001 >nul
title SciFlow Dev Server
echo ========================================
echo   SciFlow AI - 启动开发服务器
echo ========================================
echo.

cd /d "%~dp0"

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [!] 首次运行，安装依赖中...
    call npm install
    echo.
)

:: 启动 dev server
echo [✓] 启动 Next.js 开发服务器...
echo [i] 浏览器访问: http://localhost:3000
echo [i] 按 Ctrl+C 停止服务器
echo.
call npm run dev
