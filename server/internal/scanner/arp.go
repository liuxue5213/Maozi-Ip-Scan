package scanner

import (
	"bufio"
	"net"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// ARPScanner ARP 扫描器
type ARPScanner struct {
	iface   *NetworkInterface
	timeout time.Duration
}

// NewARPScanner 创建 ARP 扫描器
func NewARPScanner(iface *NetworkInterface, timeout time.Duration) *ARPScanner {
	return &ARPScanner{
		iface:   iface,
		timeout: timeout,
	}
}

// Scan 执行 ARP 扫描：先 ping 网段触发 ARP 解析，再读取系统 ARP 表。
func (s *ARPScanner) Scan(cidr string) ([]*Device, error) {
	// 先对网段做 ping 扫描，让系统 ARP 表填充起来
	s.pingSweep(cidr)

	// 等待系统写入 ARP 表
	time.Sleep(500 * time.Millisecond)

	devices := s.readARPTable()

	// 过滤：只保留目标网段内的设备
	result := make([]*Device, 0, len(devices))
	for _, d := range devices {
		if ipInCIDR(d.IP, cidr) {
			d.Source = "arp"
			result = append(result, d)
		}
	}
	return result, nil
}

// macOS `arp -a` 输出行格式：
// ? (192.168.1.1) at a4:2b:b0:11:22:33 on en0 ifscope [ethernet]
var darwinArpLine = regexp.MustCompile(`\(([\d.]+)\) at ([0-9a-fA-F:]+) on`)

// readARPTable 读取系统 ARP 缓存（跨平台）
func (s *ARPScanner) readARPTable() []*Device {
	switch runtime.GOOS {
	case "darwin":
		return readARPTableDarwin()
	case "linux":
		return readARPTableLinux()
	default:
		return nil
	}
}

// readARPTableDarwin 解析 macOS 的 `arp -a` 输出
func readARPTableDarwin() []*Device {
	cmd := exec.Command("arp", "-a", "-n")
	out, err := cmd.Output()
	if err != nil {
		return nil
	}

	var devices []*Device
	now := time.Now()
	for _, line := range strings.Split(string(out), "\n") {
		m := darwinArpLine.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		ip, mac := m[1], strings.ToLower(m[2])
		if mac == "00:00:00:00:00:00" {
			continue
		}
		devices = append(devices, newARPDevice(ip, mac, now))
	}
	return devices
}

// readARPTableLinux 解析 Linux 的 /proc/net/arp
func readARPTableLinux() []*Device {
	file, err := os.Open("/proc/net/arp")
	if err != nil {
		return nil
	}
	defer file.Close()

	var devices []*Device
	now := time.Now()
	scanner := bufio.NewScanner(file)
	scanner.Scan() // 跳过表头

	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 6 {
			continue
		}
		ip, mac := fields[0], strings.ToLower(fields[3])
		if mac == "00:00:00:00:00:00" {
			continue
		}
		devices = append(devices, newARPDevice(ip, mac, now))
	}
	return devices
}

// newARPDevice 构造 ARP 设备条目，附带主机名与厂商
func newARPDevice(ip, mac string, now time.Time) *Device {
	device := &Device{
		IP:        ip,
		MAC:       mac,
		Status:    "online",
		FirstSeen: now,
		LastSeen:  now,
	}

	if names, err := net.LookupAddr(ip); err == nil && len(names) > 0 {
		device.Hostname = strings.TrimSuffix(names[0], ".")
	}

	device.Vendor = LookupVendor(mac)
	return device
}

// pingSweep 对网段内所有 IP 发送 ping 以触发 ARP 解析
func (s *ARPScanner) pingSweep(cidr string) {
	ip, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return
	}

	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 50) // 并发限制

	for target := ip.Mask(ipNet.Mask); ipNet.Contains(target); incrementIP(target) {
		if target.IsLoopback() {
			continue
		}

		wg.Add(1)
		semaphore <- struct{}{}

		go func(addr string) {
			defer wg.Done()
			defer func() { <-semaphore }()
			Ping(addr, s.timeout)
		}(target.String())
	}

	wg.Wait()
}

// incrementIP IP 地址递增（原地修改）
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

// ipInCIDR 判断 IP 是否落在 CIDR 网段内
func ipInCIDR(ipStr, cidr string) bool {
	ip := net.ParseIP(ipStr)
	_, ipNet, err := net.ParseCIDR(cidr)
	if err != nil || ip == nil {
		return false
	}
	return ipNet.Contains(ip)
}
