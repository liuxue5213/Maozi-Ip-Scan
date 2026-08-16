package history

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Entry 单次扫描历史记录
type Entry struct {
	ID          string       `json:"id"`
	Time        time.Time    `json:"time"`
	CIDR        string       `json:"cidr"`
	Modes       []string     `json:"modes"`
	DeviceCount int          `json:"deviceCount"`
	Devices     []DeviceSnapshot `json:"devices"`
	ScanTimeMs  int64        `json:"scanTimeMs"`
}

// DeviceSnapshot 某次扫描中的设备快照
type DeviceSnapshot struct {
	IP        string `json:"ip"`
	MAC       string `json:"mac"`
	Hostname  string `json:"hostname"`
	Vendor    string `json:"vendor"`
	Source    string `json:"source"`
	OpenPorts []int  `json:"openPorts,omitempty"`
}

// Diff 两次扫描的差异
type Diff struct {
	NewDevices     []DeviceSnapshot `json:"newDevices"`     // 新出现的设备
	GoneDevices    []DeviceSnapshot `json:"goneDevices"`    // 已离线的设备
	StableCount    int              `json:"stableCount"`    // 始终在线的设备数
}

// Store 历史记录存储（内存 + JSON 文件持久化）
type Store struct {
	mu       sync.RWMutex
	entries  []Entry
	filePath string
	maxKeep  int
}

// NewStore 创建历史存储。
// filePath 为持久化文件路径（空则只存内存），maxKeep 为最多保留条数。
func NewStore(filePath string, maxKeep int) *Store {
	if maxKeep <= 0 {
		maxKeep = 50
	}
	s := &Store{
		entries:  make([]Entry, 0),
		filePath: filePath,
		maxKeep:  maxKeep,
	}
	if filePath != "" {
		s.loadFromFile()
	}
	return s
}

// Add 添加一条历史记录
func (s *Store) Add(entry *Entry) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if entry.ID == "" {
		entry.ID = generateID(entry.Time, entry.CIDR)
	}
	s.entries = append(s.entries, *entry)

	// 超出上限时裁剪最早的
	if len(s.entries) > s.maxKeep {
		s.entries = s.entries[len(s.entries)-s.maxKeep:]
	}

	// 按时间升序
	sort.Slice(s.entries, func(i, j int) bool {
		return s.entries[i].Time.Before(s.entries[j].Time)
	})

	s.persist()
}

// GetAll 返回全部历史（按时间倒序，最新在前）
func (s *Store) GetAll() []Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]Entry, len(s.entries))
	for i, e := range s.entries {
		result[len(s.entries)-1-i] = e
	}
	return result
}

// Get 根据 ID 获取单条记录
func (s *Store) Get(id string) (*Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for i := range s.entries {
		if s.entries[i].ID == id {
			return &s.entries[i], true
		}
	}
	return nil, false
}

// Latest 返回最近一条记录
func (s *Store) Latest() (*Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(s.entries) == 0 {
		return nil, false
	}
	return &s.entries[len(s.entries)-1], true
}

// Count 返回历史条数
func (s *Store) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.entries)
}

// Clear 清空所有历史
func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = make([]Entry, 0)
	s.persist()
}

// Compare 对比两次扫描（latest vs previous），返回设备变化
func (s *Store) Compare() *Diff {
	s.mu.RLock()
	defer s.mu.RUnlock()

	diff := &Diff{
		NewDevices:  make([]DeviceSnapshot, 0),
		GoneDevices: make([]DeviceSnapshot, 0),
	}

	if len(s.entries) < 2 {
		return diff
	}

	latest := s.entries[len(s.entries)-1]
	previous := s.entries[len(s.entries)-2]

	prevMap := make(map[string]DeviceSnapshot, len(previous.Devices))
	for _, d := range previous.Devices {
		prevMap[d.IP] = d
	}

	currMap := make(map[string]DeviceSnapshot, len(latest.Devices))
	for _, d := range latest.Devices {
		currMap[d.IP] = d
	}

	// 新出现的
	for ip, d := range currMap {
		if _, ok := prevMap[ip]; !ok {
			diff.NewDevices = append(diff.NewDevices, d)
		} else {
			diff.StableCount++
		}
	}

	// 已离线的
	for ip, d := range prevMap {
		if _, ok := currMap[ip]; !ok {
			diff.GoneDevices = append(diff.GoneDevices, d)
		}
	}

	return diff
}

// ---- 持久化 ----

func (s *Store) loadFromFile() {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return // 文件不存在时静默忽略
	}
	var entries []Entry
	if err := json.Unmarshal(data, &entries); err != nil {
		return
	}
	s.entries = entries
}

func (s *Store) persist() {
	if s.filePath == "" {
		return
	}
	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return
	}
	data, err := json.MarshalIndent(s.entries, "", "  ")
	if err != nil {
		return
	}
	// 写入临时文件后 rename，避免写一半被读到
	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err == nil {
		os.Rename(tmp, s.filePath)
	}
}

// generateID 根据时间和网段生成唯一 ID
func generateID(t time.Time, cidr string) string {
	h := sha1.New()
	h.Write([]byte(t.String() + cidr))
	return hex.EncodeToString(h.Sum(nil))[:12]
}
