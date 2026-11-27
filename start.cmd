@echo off
chcp 65001 >nul
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo 未找到 pnpm。请先安装 Node.js 和 pnpm:
  echo   npm install -g pnpm
  pause
  exit /b 1
)

if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call pnpm install
  if errorlevel 1 (
    echo 依赖安装失败
    pause
    exit /b 1
  )
)

echo 启动 Vite 开发服务器: http://127.0.0.1:8123/
echo 按 Ctrl+C 停止。
call pnpm run dev -- --port 8123 --open
