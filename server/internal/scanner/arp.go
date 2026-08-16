package scanner

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"
)

// ARPScanner ARP 扫描器
type ARPScanner struct {
	iface    *NetworkInterface
	timeout  time.Duration
}

// NewARPScanner 创建 ARP 扫描器
func NewARPScanner(iface *NetworkInterface, timeout time.Duration) *ARPScanner {
	return &ARPScanner{
		iface:   iface,
		timeout: timeout,
	}
}

// Scan 执行 ARP 扫描
func (s *ARPScanner) Scan(cidr string) ([]*Device, error) {
	devices := s.readARPTable()
	
	// 主动扫描：ping 网段内所有 IP 以填充 ARP 表
	s.pingSweep(cidr)
	
	// 再次读取 ARP 表
	time.Sleep(500 * time.Millisecond)
	newDevices := s.readARPTable()
	
	// 合并结果
	deviceMap := make(map[string]*Device)
	for _, d := range devices {
		deviceMap[d.IP] = d
	}
	for _, d := range newDevices {
		deviceMap[d.IP] = d
	}
	
	result := make([]*Device, 0, len(deviceMap))
	for _, d := range deviceMap {
		d.Source = "arp"
		result = append(result, d)
	}
	
	return result, nil
}

// readARPTable 从系统 ARP 缓存读取
func (s *ARPScanner) readARPTable() []*Device {
	file, err := os.Open("/proc/net/arp")
	if err != nil {
		return nil
	}
	defer file.Close()

	var devices []*Device
	scanner := bufio.NewScanner(file)
	scanner.Scan() // 跳过表头
	
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 6 {
			continue
		}
		
		ip := fields[0]
		mac := fields[3]
		
		// 跳过不完整的条目
		if mac == "00:00:00:00:00:00" {
			continue
		}
		
		device := &Device{
			IP:        ip,
			MAC:       mac,
			Status:    "online",
			FirstSeen: time.Now(),
			LastSeen:  time.Now(),
		}
		
		// 反向解析主机名
		names, _ := net.LookupAddr(ip)
		if len(names) > 0 {
			device.Hostname = strings.TrimSuffix(names[0], ".")
		}
		
		device.Vendor = LookupVendor(mac)
		devices = append(devices, device)
	}
	
	return devices
}

// pingSweep 对网段内所有 IP 发送 ping 以触发 ARP
func (s *ARPScanner) pingSweep(cidr string) {
	ip, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return
	}

	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 50) // 并发限制
	
	for ip := ip.Mask(ipNet.Mask); ipNet.Contains(ip); incrementIP(ip) {
		if ip.IsLoopback() || ip.Equal(getBroadcastIP(ipNet)) {
			continue
		}
		
		wg.Add(1)
		semaphore <- struct{}{}
		
		go func(target string) {
			defer wg.Done()
			defer func() { <-semaphore }()
			pingHost(target)
		}(ip.String())
	}
	
	wg.Wait()
}

// pingHost 发送单个 ICMP ping
func pingHost(ip string) {
	conn, err := net.DialTimeout("ip4:icmp", ip, 1*time.Second)
	if err != nil {
		return
	}
	defer conn.Close()
	
	// 构造 ICMP Echo Request
	msg := make([]byte, 8)
	msg[0] = 8  // Echo Request
	msg[1] = 0  // Code
	msg[2] = 0  // Checksum (高)
	msg[3] = 0  // Checksum (低)
	msg[4] = 0  // Identifier
	msg[5] = 1  // Identifier
	msg[6] = 0  // Sequence
	msg[7] = 1  // Sequence
	
	// 计算校验和
	checksum := checkSum(msg)
	msg[2] = byte(checksum >> 8)
	msg[3] = byte(checksum & 0xff)
	
	conn.SetDeadline(time.Now().Add(1 * time.Second))
	conn.Write(msg)
}

// checkSum 计算 ICMP 校验和
func checkSum(data []byte) uint16 {
	var sum uint32
	for i := 0; i < len(data)-1; i += 2 {
		sum += uint32(data[i])<<8 + uint32(data[i+1])
	}
	if len(data)%2 == 1 {
		sum += uint32(data[len(data)-1]) << 8
	}
	for (sum >> 16) > 0 {
		sum = (sum & 0xffff) + (sum >> 16)
	}
	return uint16(^sum)
}

// incrementIP IP 地址递增
func incrementIP(ip net.IP) {
	for j := len(ip) - 1; j >= 0; j-- {
		ip[j]++
		if ip[j] > 0 {
			break
		}
	}
}

// getBroadcastIP 获取广播地址
func getBroadcastIP(ipNet *net.IPNet) net.IP {
	broadcast := make(net.IP, len(ipNet.IP))
	for i := range ipNet.IP {
		broadcast[i] = ipNet.IP[i] | ^ipNet.Mask[i]
	}
	return broadcast
}
