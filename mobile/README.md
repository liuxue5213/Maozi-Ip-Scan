# Maozi-Scan Android 端

React Native 开发的 Android 局域网扫描 App。

## 功能

- 📶 显示当前 WiFi 网络信息
- 🔍 ARP 表读取 + ICMP Ping 扫描
- 📋 设备列表（IP/MAC/厂商）
- 🔗 快捷访问设备 HTTP/HTTPS
- 📋 IP 一键复制

## 开发

```bash
npm install
npx react-native run-android
```

## 打包

通过 GitHub Actions 自动打包，支持：
- Debug APK（每次 push 自动生成）
- Release APK（tag 推送时生成）

## 原生模块

- `ArpModule.java` — 读取系统 ARP 表、Ping、获取网络信息
