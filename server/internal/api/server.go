package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"maozi-scan/internal/scanner"
	"maozi-scan/internal/sshproxy"
)

// Server HTTP 服务器
type Server struct {
	addr     string
	webDir   string // 前端静态文件目录
	upgrader websocket.Upgrader

	mu        sync.RWMutex
	devices   []*scanner.Device
	scanning  bool
	lastError string
	lastScan  time.Time
}

// NewServer 创建 API 服务器。
// webDir 为前端打包产物目录；从 server/ 目录运行时默认是 ../web/dist。
func NewServer(addr, webDir string) *Server {
	return &Server{
		addr:   addr,
		webDir: webDir,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		devices: make([]*scanner.Device, 0),
	}
}

// Start 启动服务器
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// API 路由
	mux.HandleFunc("/api/interfaces", s.handleInterfaces)
	mux.HandleFunc("/api/scan", s.handleScan)
	mux.HandleFunc("/api/scan/status", s.handleScanStatus)
	mux.HandleFunc("/api/devices", s.handleDevices)
	mux.HandleFunc("/api/ping", s.handlePing)
	mux.HandleFunc("/api/ssh", s.handleSSH)

	// 健康检查
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, APIResponse{Success: true, Message: "ok"})
	})

	// 静态文件（前端打包后），API 路由已注册在更具体的 pattern 上，不受影响
	mux.Handle("/", http.FileServer(http.Dir(s.webDir)))

	log.Printf("Server starting on %s (web dir: %s)", s.addr, s.webDir)
	return http.ListenAndServe(s.addr, s.corsMiddleware(mux))
}

// corsMiddleware 跨域中间件
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// handleInterfaces 获取网络接口列表
func (s *Server) handleInterfaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	interfaces, err := scanner.GetInterfaces()
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    interfaces,
	})
}

// handleScan 启动扫描
func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var config scanner.ScanConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		respondJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "Invalid request body: " + err.Error(),
		})
		return
	}

	// 默认扫描模式
	if len(config.Modes) == 0 {
		config.Modes = []string{"arp", "icmp", "mdns"}
	}

	s.mu.Lock()
	if s.scanning {
		s.mu.Unlock()
		respondJSON(w, http.StatusConflict, APIResponse{
			Success: false,
			Message: "scan already in progress",
		})
		return
	}
	s.scanning = true
	s.mu.Unlock()

	// 异步执行扫描，完成后写入结果与状态
	go func() {
		scan := scanner.NewScanner(config)
		result, err := scan.Execute()

		s.mu.Lock()
		s.scanning = false
		s.lastScan = time.Now()
		if err != nil {
			s.lastError = err.Error()
			log.Printf("Scan error: %v", err)
		} else {
			s.lastError = ""
			s.devices = result.Devices
			log.Printf("Scan completed: found %d devices in %dms", result.Found, result.ScanTime)
		}
		s.mu.Unlock()
	}()

	respondJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "Scan started",
	})
}

// handleScanStatus 获取扫描状态：前端据此判断扫描何时结束（即使结果为空）
func (s *Server) handleScanStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.RLock()
	status := map[string]interface{}{
		"scanning":    s.scanning,
		"deviceCount": len(s.devices),
		"lastError":   s.lastError,
	}
	if !s.lastScan.IsZero() {
		status["lastScan"] = s.lastScan.Unix()
	}
	s.mu.RUnlock()

	respondJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    status,
	})
}

// handleDevices 获取已发现设备列表
func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.RLock()
	devices := s.devices
	s.mu.RUnlock()

	respondJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    devices,
	})
}

// handlePing Ping 单个 IP（系统 ping 命令，无需 root）
func (s *Server) handlePing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ip := r.URL.Query().Get("ip")
	if net.ParseIP(ip) == nil {
		respondJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "valid ip parameter required",
		})
		return
	}

	online := scanner.Ping(ip, 3*time.Second)

	respondJSON(w, http.StatusOK, APIResponse{
		Success: online,
		Data: map[string]interface{}{
			"ip":     ip,
			"online": online,
		},
		Message: map[bool]string{true: "host is reachable", false: "host is unreachable"}[online],
	})
}

// handleSSH SSH WebSocket 代理
func (s *Server) handleSSH(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 从查询参数获取 SSH 配置
	config := &sshproxy.SSHConfig{
		Host:     r.URL.Query().Get("host"),
		Port:     parseIntOrDefault(r.URL.Query().Get("port"), 22),
		Username: r.URL.Query().Get("username"),
		Password: r.URL.Query().Get("password"),
		Cols:     parseIntOrDefault(r.URL.Query().Get("cols"), 80),
		Rows:     parseIntOrDefault(r.URL.Query().Get("rows"), 24),
	}

	if config.Host == "" || config.Username == "" {
		respondJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "host and username required",
		})
		return
	}

	// 升级为 WebSocket
	ws, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	// 建立 SSH 连接
	session := sshproxy.NewSSHSession(config)
	if err := session.Connect(); err != nil {
		ws.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\nSSH connect failed: %v\r\n", err)))
		return
	}
	defer session.Close()

	// 启动 shell
	if err := session.StartShell(); err != nil {
		ws.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\nSSH shell failed: %v\r\n", err)))
		return
	}

	// 桥接 WebSocket ↔ SSH
	session.HandleWebSocket(ws)
}

// APIResponse API 统一响应格式
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// respondJSON 返回 JSON 响应
func respondJSON(w http.ResponseWriter, status int, resp APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(resp)
}

// parseIntOrDefault 解析整数，失败返回默认值
func parseIntOrDefault(s string, defaultVal int) int {
	var val int
	if _, err := fmt.Sscanf(s, "%d", &val); err == nil {
		return val
	}
	return defaultVal
}
