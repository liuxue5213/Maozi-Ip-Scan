package scanner

import (
	"net"
	"sync"
	"time"
)

// ICMPScanner ICMP 扫描器
type ICMPScanner struct {
	iface   *NetworkInterface
	timeout int
}

// NewICMPScanner 创建 ICMP 扫描器
func NewICMPScanner(iface *NetworkInterface, timeout int) *ICMPScanner {
	return &ICMPScanner{
		iface:   iface,
		timeout: timeout,
	}
}

// Scan 执行 ICMP 扫描
func (s *ICMPScanner) Scan(cidr string) ([]*Device, error) {
	ip, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil, err
	}

	var devices []*Device
	var mu sync.Mutex
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 100) // 并发限制

	for ip := ip.Mask(ipNet.Mask); ipNet.Contains(ip); incrementIP(ip) {
		if ip.IsLoopback() || ip.Equal(getBroadcastIP(ipNet)) {
			continue
		}

		wg.Add(1)
		semaphore <- struct{}{}

		go func(target string) {
			defer wg.Done()
			defer func() { <-semaphore }()

			if s.ping(target) {
				device := &Device{
					IP:        target,
					Status:    "online",
					FirstSeen: time.Now(),
					LastSeen:  time.Now(),
					Source:    "icmp",
				}
				
				// 反向解析主机名
				names, _ := net.LookupAddr(target)
				if len(names) > 0 {
					device.Hostname = names[0]
				}
				
				mu.Lock()
				devices = append(devices, device)
				mu.Unlock()
			}
		}(ip.String())
	}

	wg.Wait()
	return devices, nil
}

// ping 单个 IP 的 ICMP 探测
func (s *ICMPScanner) ping(ip string) bool {
	conn, err := net.DialTimeout("ip4:icmp", ip, time.Duration(s.timeout)*time.Second)
	if err != nil {
		return false
	}
	defer conn.Close()

	msg := make([]byte, 8)
	msg[0] = 8
	msg[1] = 0
	msg[4] = 0
	msg[5] = 1
	msg[6] = 0
	msg[7] = 1

	checksum := checkSum(msg)
	msg[2] = byte(checksum >> 8)
	msg[3] = byte(checksum & 0xff)

	conn.SetDeadline(time.Now().Add(time.Duration(s.timeout) * time.Second))
	if _, err := conn.Write(msg); err != nil {
		return false
	}

	reply := make([]byte, 1024)
	_, err = conn.Read(reply)
	return err == nil
}
