package scanner

import (
	"net"
	"strings"
	"sync"
	"time"
)

// ICMPScanner ICMP 扫描器
type ICMPScanner struct {
	iface   *NetworkInterface
	timeout int // 秒
}

// NewICMPScanner 创建 ICMP 扫描器
func NewICMPScanner(iface *NetworkInterface, timeout int) *ICMPScanner {
	return &ICMPScanner{
		iface:   iface,
		timeout: timeout,
	}
}

// Scan 执行 ICMP 扫描（基于系统 ping 命令，无需 root）
func (s *ICMPScanner) Scan(cidr string) ([]*Device, error) {
	ip, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil, err
	}
	if s.timeout <= 0 {
		s.timeout = 3
	}
	timeout := time.Duration(s.timeout) * time.Second

	var devices []*Device
	var mu sync.Mutex
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 100) // 并发限制

	broadcast := getBroadcastIP(ipNet)
	for target := ip.Mask(ipNet.Mask); ipNet.Contains(target); incrementIP(target) {
		if target.IsLoopback() || target.Equal(broadcast) || target.Equal(ipNet.IP) {
			continue
		}

		wg.Add(1)
		semaphore <- struct{}{}

		go func(addr string) {
			defer wg.Done()
			defer func() { <-semaphore }()

			if !Ping(addr, timeout) {
				return
			}

			device := &Device{
				IP:        addr,
				Status:    "online",
				FirstSeen: time.Now(),
				LastSeen:  time.Now(),
				Source:    "icmp",
			}

			if names, err := net.LookupAddr(addr); err == nil && len(names) > 0 {
				device.Hostname = strings.TrimSuffix(names[0], ".")
			}

			mu.Lock()
			devices = append(devices, device)
			mu.Unlock()
		}(target.String())
	}

	wg.Wait()
	return devices, nil
}
