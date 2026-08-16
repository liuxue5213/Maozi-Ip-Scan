# Maozi-Ip-Scan

🐱 局域网设备扫描工具 — Web + Android 多平台支持

## 功能特性

- 🔍 **多协议扫描**: ARP + ICMP + mDNS 全面发现局域网设备
- 📡 **网络接口选择**: 支持 WiFi / 以太网，自由选择扫描网卡
- 💻 **Web SSH 终端**: 浏览器内直接 SSH 连接设备
- 📱 **Android 移动端**: 随时随地快速定位设备 IP
- 🏷️ **设备识别**: MAC 厂商识别、主机名解析、端口探测

## 项目结构

```
Maozi-Ip-Scan/
├── server/     # Go 后端（扫描引擎 + SSH 代理）
├── web/        # Vue3 + TypeScript 前端
├── mobile/     # React Native Android
└── .github/    # GitHub Actions 打包
```

## 快速开始

### 后端
```bash
cd server
go run cmd/server/main.go
```

### 前端
```bash
cd web
npm install
npm run dev
```

### Android
```bash
cd mobile
npm install
npx react-native run-android
```

## License

MIT
