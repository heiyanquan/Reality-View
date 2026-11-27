@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PORT=8123"
set "URL=http://127.0.0.1:%PORT%/index.html"

where python >nul 2>nul
if not errorlevel 1 goto :python

where npx >nul 2>nul
if not errorlevel 1 goto :node

echo 未找到 python 或 npx。请任选其一安装，或用任意静态服务器把本目录跑起来。
echo 页面必须通过 http:// 打开，直接双击 html 会被浏览器的 CORS 策略拦住。
pause
exit /b 1

:python
echo 正在 http://127.0.0.1:%PORT% 提供本目录，按 Ctrl+C 停止。
start "" "%URL%"
python -m http.server %PORT% --bind 127.0.0.1
exit /b 0

:node
echo 正在 http://127.0.0.1:%PORT% 提供本目录，按 Ctrl+C 停止。
start "" "%URL%"
npx --yes serve -l %PORT% .
exit /b 0
