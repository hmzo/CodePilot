#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "启动 CodePilot 开发环境..."

# 检查 node_modules
if [ ! -d "node_modules" ]; then
  echo "安装依赖..."
  npm install
fi

# 编译 Electron 主进程 TypeScript
if [ ! -f "dist-electron/main.js" ]; then
  echo "编译 Electron 主进程..."
  npx tsc -p electron/tsconfig.json
fi

# 清理占用 3000 端口的进程
PORT_PID=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  echo "释放端口 3000（PID: $PORT_PID）..."
  kill "$PORT_PID" 2>/dev/null || true
  sleep 1
fi

npm run electron:dev
