# Maozi-Scan 后端服务

Go 语言实现的局域网扫描引擎 + SSH 代理服务。

## 功能

- 🔍 网络扫描（ARP/ICMP/mDNS）
- 📡 网络接口枚举
- 🔐 WebSocket → SSH 代理
- 🌐 RESTful API

## 目录结构

```
server/
├── cmd/server/main.go       # 入口
├── internal/
│   ├── scanner/             # 扫描引擎
│   │   ├── types.go         # 数据类型
│   │   ├── interface.go     # 网络接口
│   │   ├── arp.go           # ARP 扫描
│   │   ├── icmp.go          # ICMP 扫描
│   │   ├── mdns.go          # mDNS 扫描
│   │   ├── vendor.go        # MAC 厂商识别
│   │   └── scanner.go       # 扫描调度
│   ├── sshproxy/            # SSH 代理
│   │   └── proxy.go         # WebSocket 桥接
│   └── api/                 # HTTP API
│       └── server.go        # 路由和服务
├── Dockerfile
└── go.mod
```

## 运行

```bash
go mod tidy   # 首次运行需要（生成 go.sum）
go run cmd/server/main.go -addr :8080 -web ../web/dist
```

参数说明：
- `-addr` 监听地址，默认 `:8080`
- `-web` 前端静态文件目录，默认 `../web/dist`（从 server/ 目录运行时的相对路径）

> 注：扫描基于系统 `ping` 命令与 ARP 表读取，无需 root 权限；macOS 与 Linux 均可运行。

## Docker

```bash
docker build -t maozi-scan .
docker run --net=host -p 8080:8080 maozi-scan
```

> ⚠️ 网络扫描需要 `--net=host` 权限。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/interfaces | 网络接口列表 |
| POST | /api/scan | 启动扫描 |
| GET | /api/scan/status | 扫描状态（scanning/deviceCount/lastError） |
| GET | /api/devices | 获取设备列表 |
| GET | /api/ping?ip=x.x.x.x | Ping 测试 |
| WS | /api/ssh?host=x.x.x.x&username=xxx | SSH 代理 |
