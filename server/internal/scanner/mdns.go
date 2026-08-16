package scanner

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/hashicorp/mdns"
)

// mDNSScanner mDNS 扫描器
type mDNSScanner struct {
	timeout int
}

// NewmDNSScanner 创建 mDNS 扫描器
func NewmDNSScanner(timeout int) *mDNSScanner {
	return &mDNSScanner{timeout: timeout}
}

// Scan 执行 mDNS 服务发现
func (s *mDNSScanner) Scan() ([]*Device, error) {
	var devices []*Device
	devicesChan := make(chan *mdns.ServiceEntry, 100)
	
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.timeout)*time.Second)
	defer cancel()

	go func() {
		for entry := range devicesChan {
			device := parseServiceEntry(entry)
			if device != nil {
				devices = append(devices, device)
			}
		}
	}()

	// 发现常见服务
	params := &mdns.QueryParam{
		Domain:    "local",
		Entries:   devicesChan,
		Timeout:   time.Duration(s.timeout) * time.Second,
		Interface: nil, // 所有接口
	}
	
	// 查询常见服务类型
	services := []string{
		"_http._tcp",
		"_ssh._tcp",
		"_smb._tcp",
		"_raop._tcp",
		"_airplay._tcp",
		"_ipp._tcp",
		"_printer._tcp",
		"_googlecast._tcp",
		"_hap._tcp",
	}
	
	for _, service := range services {
		params.Service = service
		mdns.Query(params)
	}
	
	cancel()
	close(devicesChan)
	
	// 等待收集完成
	time.Sleep(100 * time.Millisecond)
	
	return devices, nil
}

// parseServiceEntry 解析 mDNS 服务条目为设备
func parseServiceEntry(entry *mdns.ServiceEntry) *Device {
	if entry.AddrV4 == nil {
		return nil
	}
	
	device := &Device{
		IP:        entry.AddrV4.String(),
		Status:    "online",
		FirstSeen: time.Now(),
		LastSeen:  time.Now(),
		Source:    "mdns",
	}
	
	if entry.Name != "" {
		device.Hostname = strings.TrimSuffix(entry.Name, ".local")
		device.Hostname = strings.TrimSuffix(device.Hostname, ".")
	}
	
	if entry.Info != "" {
		device.Vendor = entry.Info
	}
	
	return device
}

// QuerySpecificService 查询特定 mDNS 服务
func QuerySpecificService(service string, timeout int) ([]*Device, error) {
	var devices []*Device
	entries := make(chan *mdns.ServiceEntry, 10)
	
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()
	
	go func() {
		for entry := range entries {
			if entry.AddrV4 != nil {
				devices = append(devices, parseServiceEntry(entry))
			}
		}
	}()
	
	params := &mdns.QueryParam{
		Service: service,
		Domain:  "local",
		Entries: entries,
		Timeout: time.Duration(timeout) * time.Second,
	}
	
	err := mdns.Query(params)
	cancel()
	close(entries)
	time.Sleep(100 * time.Millisecond)
	
	return devices, err
}

// GetMDNSName 通过 IP 反向查找 mDNS 名称
func GetMDNSName(ip string) string {
	names, err := net.LookupAddr(ip)
	if err != nil {
		return ""
	}
	for _, name := range names {
		if strings.Contains(name, ".local") {
			return strings.TrimSuffix(name, ".")
		}
	}
	if len(names) > 0 {
		return strings.TrimSuffix(names[0], ".")
	}
	return ""
}

// 辅助函数 - 确保导入
var _ = fmt.Sprintf
