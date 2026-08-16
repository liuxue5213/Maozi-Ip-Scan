# Maozi-Scan Web 前端

Vue3 + TypeScript + Element Plus 构建的局域网扫描管理界面。

## 功能

- 📡 选择网络接口（WiFi/以太网）
- 🔍 ARP + ICMP + mDNS 多协议扫描
- 📋 设备列表展示（IP/MAC/厂商/主机名）
- 🔐 内置 SSH 终端（xterm.js）

## 开发

```bash
npm install
npm run dev    # 开发模式，代理到 localhost:8080
npm run build  # 打包到 dist/
```

## 部署

打包后的 `dist/` 目录可由 Go 后端静态文件服务托管（`server/web/dist`）。
