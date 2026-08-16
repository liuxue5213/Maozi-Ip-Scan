package scanner

import "time"

// Device 表示扫描发现的网络设备
type Device struct {
	IP          string    `json:"ip"`
	MAC         string    `json:"mac"`
	Hostname    string    `json:"hostname"`
	Vendor      string    `json:"vendor"`
	Status      string    `json:"status"` // online, offline
	FirstSeen   time.Time `json:"firstSeen"`
	LastSeen    time.Time `json:"lastSeen"`
	OpenPorts   []int     `json:"openPorts,omitempty"`
	Source      string    `json:"source"` // arp, icmp, mdns
}

// NetworkInterface 表示一个网络接口
type NetworkInterface struct {
	Name      string   `json:"name"`
	DisplayName string `json:"displayName"`
	MAC       string   `json:"mac"`
	IPs       []string `json:"ips"`
	IsUp      bool     `json:"isUp"`
	Type      string   `json:"type"` // wifi, ethernet, loopback, other
}

// ScanConfig 扫描配置
type ScanConfig struct {
	Interface   string   `json:"interface"`   // 网卡名称
	CIDR        string   `json:"cidr"`        // 如 "192.168.1.0/24"
	Modes       []string `json:"modes"`       // ["arp", "icmp", "mdns"]
	Timeout     int      `json:"timeout"`     // 秒
	PortScan    bool     `json:"portScan"`    // 是否扫描常用端口
	CommonPorts []int    `json:"commonPorts"` // 常用端口列表
}

// ScanResult 扫描结果
type ScanResult struct {
	Devices   []*Device `json:"devices"`
	ScanTime  int64     `json:"scanTime"`  // 毫秒
	TotalIPs  int       `json:"totalIPs"`
	Found     int       `json:"found"`
}
