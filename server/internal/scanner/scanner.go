package scanner

import (
	"fmt"
	"net"
	"sync"
	"time"
)

// Scanner 主扫描器
type Scanner struct {
	config ScanConfig
}

// NewScanner 创建扫描器
func NewScanner(config ScanConfig) *Scanner {
	return &Scanner{config: config}
}

// Execute 执行完整扫描
func (s *Scanner) Execute() (*ScanResult, error) {
	startTime := time.Now()
	
	// 获取接口信息
	iface, err := GetInterfaceByName(s.config.Interface)
	if err != nil {
		// 如果没有指定接口，获取第一个可用的
		interfaces, _ := GetInterfaces()
		if len(interfaces) == 0 {
			return nil, fmt.Errorf("no available network interface")
		}
		iface = interfaces[0]
	}
	
	// 如果没有指定 CIDR，根据接口 IP 自动生成
	cidr := s.config.CIDR
	if cidr == "" {
		cidr = generateCIDR(iface.IPs[0])
	}
	
	// 默认超时
	timeout := s.config.Timeout
	if timeout <= 0 {
		timeout = 3
	}
	
	// 根据模式选择扫描方式
	deviceMap := make(map[string]*Device)
	var mu sync.Mutex
	var wg sync.WaitGroup
	
	for _, mode := range s.config.Modes {
		switch mode {
		case "arp":
			wg.Add(1)
			go func() {
				defer wg.Done()
				scanner := NewARPScanner(iface, time.Duration(timeout)*time.Second)
				devices, _ := scanner.Scan(cidr)
				mu.Lock()
				for _, d := range devices {
					deviceMap[d.IP] = d
				}
				mu.Unlock()
			}()
			
		case "icmp":
			wg.Add(1)
			go func() {
				defer wg.Done()
				scanner := NewICMPScanner(iface, timeout)
				devices, _ := scanner.Scan(cidr)
				mu.Lock()
				for _, d := range devices {
					if existing, ok := deviceMap[d.IP]; ok {
						// 合并信息
						if existing.Hostname == "" {
							existing.Hostname = d.Hostname
						}
						existing.Source += ",icmp"
					} else {
						deviceMap[d.IP] = d
					}
				}
				mu.Unlock()
			}()
			
		case "mdns":
			wg.Add(1)
			go func() {
				defer wg.Done()
				scanner := NewmDNSScanner(timeout)
				devices, _ := scanner.Scan()
				mu.Lock()
				for _, d := range devices {
					if existing, ok := deviceMap[d.IP]; ok {
						if existing.Hostname == "" {
							deviceMap[d.IP].Hostname = d.Hostname
						}
						if existing.Vendor == "" || existing.Vendor == "Unknown" {
							deviceMap[d.IP].Vendor = d.Vendor
						}
						existing.Source += ",mdns"
					} else {
						deviceMap[d.IP] = d
					}
				}
				mu.Unlock()
			}()
		}
	}
	
	wg.Wait()
	
	// 转换为切片
	devices := make([]*Device, 0, len(deviceMap))
	for _, d := range deviceMap {
		devices = append(devices, d)
	}
	
	// 计算总 IP 数
	_, ipNet, _ := net.ParseCIDR(cidr)
	totalIPs := 0
	if ipNet != nil {
		ones, bits := ipNet.Mask.Size()
		totalIPs = 1 << (bits - ones)
		if totalIPs > 2 {
			totalIPs -= 2 // 减去网络地址和广播地址
		}
	}
	
	return &ScanResult{
		Devices:  devices,
		ScanTime: time.Since(startTime).Milliseconds(),
		TotalIPs: totalIPs,
		Found:    len(devices),
	}, nil
}

// generateCIDR 根据 IP 生成默认 /24 CIDR
func generateCIDR(ipStr string) string {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return "192.168.1.0/24"
	}
	ip = ip.To4()
	if ip == nil {
		return "192.168.1.0/24"
	}
	return fmt.Sprintf("%d.%d.%d.0/24", ip[0], ip[1], ip[2])
}
