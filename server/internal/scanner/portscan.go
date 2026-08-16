package scanner

import (
	"fmt"
	"net"
	"sort"
	"sync"
	"time"
)

// 常见端口 -> 服务名称映射
var portServiceMap = map[int]string{
	21:   "FTP",
	22:   "SSH",
	23:   "Telnet",
	25:   "SMTP",
	53:   "DNS",
	80:   "HTTP",
	110:  "POP3",
	135:  "MS-RPC",
	139:  "NetBIOS",
	143:  "IMAP",
	443:  "HTTPS",
	445:  "SMB",
	993:  "IMAPS",
	995:  "POP3S",
	1433: "MSSQL",
	1521: "Oracle",
	3306: "MySQL",
	3389: "RDP",
	5432: "PostgreSQL",
	5900: "VNC",
	6379: "Redis",
	8080: "HTTP-Proxy",
	8443: "HTTPS-Alt",
	8888: "HTTP-Alt",
	9200: "Elasticsearch",
	27017: "MongoDB",
}

// 默认扫描端口（常见服务）
var defaultScanPorts = []int{
	22, 80, 443, 445, 3389, 8080, 21, 23, 25, 53, 110, 143,
	993, 995, 3306, 5432, 5900, 6379, 8443, 1433, 1521, 27017,
}

// PortScanner TCP 端口扫描器
type PortScanner struct {
	timeout time.Duration
	ports   []int
}

// NewPortScanner 创建端口扫描器
func NewPortScanner(timeout time.Duration, ports []int) *PortScanner {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	if len(ports) == 0 {
		ports = defaultScanPorts
	}
	return &PortScanner{
		timeout: timeout,
		ports:   ports,
	}
}

// Scan 对单个 IP 做端口扫描，返回开放端口列表
func (s *PortScanner) Scan(ip string) []int {
	var openPorts []int
	var mu sync.Mutex
	var wg sync.WaitGroup

	// 并发扫描，限制并发数避免被防火墙拦截
	semaphore := make(chan struct{}, 50)

	for _, port := range s.ports {
		wg.Add(1)
		semaphore <- struct{}{}

		go func(p int) {
			defer wg.Done()
			defer func() { <-semaphore }()

			if s.isPortOpen(ip, p) {
				mu.Lock()
				openPorts = append(openPorts, p)
				mu.Unlock()
			}
		}(port)
	}

	wg.Wait()
	sort.Ints(openPorts)
	return openPorts
}

// isPortOpen 检测单个端口是否开放（TCP connect）
func (s *PortScanner) isPortOpen(ip string, port int) bool {
	addr := fmt.Sprintf("%s:%d", ip, port)
	conn, err := net.DialTimeout("tcp", addr, s.timeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// ScanDevices 对设备列表批量扫描端口（并发控制），原地填充 OpenPorts
func (s *PortScanner) ScanDevices(devices []*Device) {
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 10) // 同时扫描 10 台设备

	for _, device := range devices {
		wg.Add(1)
		semaphore <- struct{}{}

		go func(d *Device) {
			defer wg.Done()
			defer func() { <-semaphore }()
			d.OpenPorts = s.Scan(d.IP)
		}(device)
	}

	wg.Wait()
}

// GetServiceName 根据端口返回服务名称
func GetServiceName(port int) string {
	if name, ok := portServiceMap[port]; ok {
		return name
	}
	return "Unknown"
}

// GetServiceNames 批量返回端口对应的服务名称
func GetServiceNames(ports []int) map[int]string {
	result := make(map[int]string, len(ports))
	for _, p := range ports {
		result[p] = GetServiceName(p)
	}
	return result
}

// GetAllCommonPorts 返回所有预定义的常见端口
func GetAllCommonPorts() []int {
	ports := make([]int, 0, len(portServiceMap))
	for p := range portServiceMap {
		ports = append(ports, p)
	}
	sort.Ints(ports)
	return ports
}
