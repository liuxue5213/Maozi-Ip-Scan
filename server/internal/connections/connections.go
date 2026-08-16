package connections

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"golang.org/x/crypto/pbkdf2"
)

// Connection 一条保存的 SSH 连接凭据
type Connection struct {
	ID         string `json:"id"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	PassEnc    string `json:"passEnc,omitempty"` // AES-GCM 加密后的密码
	PrivateKey string `json:"privateKey,omitempty"`
	Note       string `json:"note,omitempty"`
	LastUsed   int64  `json:"lastUsed,omitempty"` // unix timestamp
}

// DecryptedConnection 返回解密后的密码（不持久化）
type DecryptedConnection struct {
	Connection
	Password string `json:"password,omitempty"`
}

// Store SSH 连接凭据存储
type Store struct {
	mu       sync.RWMutex
	conns    []Connection
	filePath string
	gcm      cipher.AEAD
}

const salt = "maozi-scan-ssh-v1" // 固定 salt（仅防彩虹表，安全边界内）

// NewStore 创建凭据存储
// key 为加密口令（建议 >= 8 位），filePath 为持久化路径（空则只存内存）
func NewStore(key, filePath string) *Store {
	s := &Store{
		conns:    make([]Connection, 0),
		filePath: filePath,
	}
	if key != "" {
		s.gcm = deriveGCM(key)
	}
	if filePath != "" {
		s.loadFromFile()
	}
	return s
}

// GetAll 返回所有连接（不含密码）
func (s *Store) GetAll() []Connection {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]Connection, len(s.conns))
	copy(result, s.conns)
	return result
}

// GetDecrypted 返回指定 ID 的连接（含解密密码）
func (s *Store) GetDecrypted(id string) (*DecryptedConnection, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, c := range s.conns {
		if c.ID == id {
			dc := &DecryptedConnection{Connection: c}
			if c.PassEnc != "" && s.gcm != nil {
				if pw, err := decrypt(s.gcm, c.PassEnc); err == nil {
					dc.Password = pw
				}
			}
			return dc, true
		}
	}
	return nil, false
}

// Save 保存/更新一条连接（明文密码传入，内部加密存储）
func (s *Store) Save(conn *Connection, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if conn.ID == "" {
		conn.ID = generateConnID(conn.Host, conn.Username)
	}

	// 加密密码
	if password != "" && s.gcm != nil {
		enc, err := encrypt(s.gcm, password)
		if err != nil {
			return err
		}
		conn.PassEnc = enc
	}

	// 更新或追加
	found := false
	for i := range s.conns {
		if s.conns[i].ID == conn.ID {
			s.conns[i] = *conn
			found = true
			break
		}
	}
	if !found {
		s.conns = append(s.conns, *conn)
	}

	return s.persist()
}

// Delete 删除一条连接
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.conns {
		if s.conns[i].ID == id {
			s.conns = append(s.conns[:i], s.conns[i+1:]...)
			return s.persist()
		}
	}
	return fmt.Errorf("connection not found")
}

// ---- 加密工具 ----

func deriveGCM(key string) cipher.AEAD {
	// PBKDF2 派生 32 字节密钥
	keyBytes := pbkdf2.Key([]byte(key), []byte(salt), 100000, 32, sha256.New)
	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return nil
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil
	}
	return gcm
}

func encrypt(gcm cipher.AEAD, plaintext string) (string, error) {
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return fmt.Sprintf("%x", ciphertext), nil
}

func decrypt(gcm cipher.AEAD, hexCipher string) (string, error) {
	data, err := parseHex(hexCipher)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func parseHex(s string) ([]byte, error) {
	result := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		var b byte
		_, err := fmt.Sscanf(s[i:i+2], "%02x", &b)
		if err != nil {
			return nil, err
		}
		result[i/2] = b
	}
	return result, nil
}

func generateConnID(host, username string) string {
	h := sha256.New()
	h.Write([]byte(fmt.Sprintf("%s@%s", username, host)))
	return fmt.Sprintf("%x", h.Sum(nil))[:12]
}

// ---- 持久化 ----

func (s *Store) loadFromFile() {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return
	}
	var conns []Connection
	if err := json.Unmarshal(data, &conns); err != nil {
		return
	}
	s.conns = conns
}

func (s *Store) persist() error {
	if s.filePath == "" {
		return nil
	}
	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s.conns, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, s.filePath)
}
