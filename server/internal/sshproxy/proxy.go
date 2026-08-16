package sshproxy

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

// SSHConfig SSH 连接配置
type SSHConfig struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"`
	Cols       int    `json:"cols"`
	Rows       int    `json:"rows"`
}

// SSHSession 表示一个 SSH 会话
type SSHSession struct {
	config    *SSHConfig
	client    *ssh.Client
	session   *ssh.Session
	ws        *websocket.Conn
	mu        sync.Mutex
	connected bool
	stdin     io.WriteCloser
	stdout    io.Reader
}

// WSMessage WebSocket 消息
type WSMessage struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
	Data string `json:"data"`
}

// upgrader WebSocket 升级器
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许所有来源
	},
}

// NewSSHSession 创建新 SSH 会话
func NewSSHSession(config *SSHConfig) *SSHSession {
	if config.Port == 0 {
		config.Port = 22
	}
	if config.Cols == 0 {
		config.Cols = 80
	}
	if config.Rows == 0 {
		config.Rows = 24
	}
	return &SSHSession{
		config: config,
	}
}

// Connect 建立 SSH 连接
func (s *SSHSession) Connect() error {
	authMethods := []ssh.AuthMethod{}

	// 如果有私钥，使用密钥认证
	if s.config.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(s.config.PrivateKey))
		if err != nil {
			return fmt.Errorf("parse private key failed: %v", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	// 如果有密码，使用密码认证
	if s.config.Password != "" {
		authMethods = append(authMethods, ssh.Password(s.config.Password))
	}

	if len(authMethods) == 0 {
		return fmt.Errorf("no auth method provided")
	}

	sshConfig := &ssh.ClientConfig{
		User:            s.config.Username,
		Auth:            authMethods,
		Timeout:         10 * time.Second,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}

	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return fmt.Errorf("SSH dial failed: %v", err)
	}

	s.client = client
	s.connected = true
	return nil
}

// StartShell 启动交互式 shell
func (s *SSHSession) StartShell() error {
	session, err := s.client.NewSession()
	if err != nil {
		return fmt.Errorf("create session failed: %v", err)
	}

	// 请求伪终端
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := session.RequestPty("xterm-256color", s.config.Rows, s.config.Cols, modes); err != nil {
		session.Close()
		return fmt.Errorf("request pty failed: %v", err)
	}

	// 获取 stdin
	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		return fmt.Errorf("stdin pipe failed: %v", err)
	}
	s.stdin = stdin

	// 获取 stdout
	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		return fmt.Errorf("stdout pipe failed: %v", err)
	}
	s.stdout = stdout

	// 获取 stderr
	stderr, err := session.StderrPipe()
	if err != nil {
		session.Close()
		return fmt.Errorf("stderr pipe failed: %v", err)
	}

	// 启动 shell
	if err := session.Shell(); err != nil {
		session.Close()
		return fmt.Errorf("start shell failed: %v", err)
	}

	s.session = session

	// 合并 stderr 到 WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stderr.Read(buf)
			if n > 0 && s.ws != nil {
				s.ws.WriteMessage(websocket.TextMessage, buf[:n])
			}
			if err != nil {
				return
			}
		}
	}()

	return nil
}

// HandleWebSocket 处理 WebSocket 连接并桥接 SSH
func (s *SSHSession) HandleWebSocket(ws *websocket.Conn) {
	s.ws = ws

	// 从 SSH 读取输出发送到 WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			if s.stdout == nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			n, err := s.stdout.Read(buf)
			if n > 0 {
				if err := ws.WriteMessage(websocket.TextMessage, buf[:n]); err != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	// 从 WebSocket 读取输入发送到 SSH
	for {
		_, message, err := ws.ReadMessage()
		if err != nil {
			return
		}

		// 尝试解析 JSON（可能包含 resize 信息）
		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err == nil {
			if msg.Type == "resize" {
				s.ResizeTerminal(msg.Rows, msg.Cols)
				continue
			}
		}

		// 普通文本输入
		if s.stdin != nil {
			s.stdin.Write(message)
		}
	}
}

// ResizeTerminal 调整终端大小
func (s *SSHSession) ResizeTerminal(rows, cols int) error {
	if s.session == nil {
		return nil
	}
	return s.session.WindowChange(rows, cols)
}

// Close 关闭 SSH 会话
func (s *SSHSession) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.stdin != nil {
		s.stdin.Close()
		s.stdin = nil
	}
	if s.session != nil {
		s.session.Close()
		s.session = nil
	}
	if s.client != nil {
		s.client.Close()
		s.client = nil
	}
	s.connected = false
}

// IsConnected 检查连接状态
func (s *SSHSession) IsConnected() bool {
	return s.connected && s.client != nil
}
