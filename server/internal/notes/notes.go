package notes

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Note 单条设备备注
type Note struct {
	IP      string `json:"ip"`
	Name    string `json:"name"`    // 自定义名称（如"测试服务器"）
	Note    string `json:"note"`    // 备注内容
	Color   string `json:"color"`   // 标签颜色
}

// Store 设备备注存储（内存 + JSON 文件持久化）
type Store struct {
	mu       sync.RWMutex
	notes    map[string]Note
	filePath string
}

// NewStore 创建备注存储
func NewStore(filePath string) *Store {
	s := &Store{
		notes:    make(map[string]Note),
		filePath: filePath,
	}
	if filePath != "" {
		s.loadFromFile()
	}
	return s
}

// Get 获取单条备注
func (s *Store) Get(ip string) (Note, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n, ok := s.notes[ip]
	return n, ok
}

// GetAll 获取全部备注
func (s *Store) GetAll() map[string]Note {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]Note, len(s.notes))
	for k, v := range s.notes {
		result[k] = v
	}
	return result
}

// Save 保存/更新备注
func (s *Store) Save(note Note) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if note.IP == "" {
		return
	}
	s.notes[note.IP] = note
	s.persist()
}

// Delete 删除备注
func (s *Store) Delete(ip string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.notes, ip)
	s.persist()
}

// ---- 持久化 ----

func (s *Store) loadFromFile() {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return
	}
	var notes map[string]Note
	if err := json.Unmarshal(data, &notes); err != nil {
		return
	}
	s.notes = notes
}

func (s *Store) persist() {
	if s.filePath == "" {
		return
	}
	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return
	}
	data, err := json.MarshalIndent(s.notes, "", "  ")
	if err != nil {
		return
	}
	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err == nil {
		os.Rename(tmp, s.filePath)
	}
}
