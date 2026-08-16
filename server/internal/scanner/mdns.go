package scanner

import (
	"net"
	"strings"
	"sync"
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

// 常见 mDNS 服务类型
var mdnsServices = []string{
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

// Scan 执行 mDNS 服务发现。
// 各服务类型并行查询，总耗时约等于单个查询的超时时间；
// 结果由单一收集 goroutine 归并，避免数据竞争。
func (s *mDNSScanner) Scan() ([]*Device, error) {
	entriesCh := make(chan *mdns.ServiceEntry, 256)
	done := make(chan []*Device, 1)

	// 收集 goroutine：唯一写 devices 的地方，按 IP 去重
	go func() {
		seen := make(map[string]*Device)
		var order []*Device
		for entry := range entriesCh {
			device := parseServiceEntry(entry)
			if device == nil {
				continue
			}
			if existing, ok := seen[device.IP]; ok {
				// 同一设备的多个服务，补全信息
				if existing.Hostname == "" {
					existing.Hostname = device.Hostname
				}
				if existing.Vendor == "" {
					existing.Vendor = device.Vendor
				}
				continue
			}
			seen[device.IP] = device
			order = append(order, device)
		}
		done <- order
	}()

	// 并行查询各服务类型
	var wg sync.WaitGroup
	for _, service := range mdnsServices {
		wg.Add(1)
		go func(svc string) {
			defer wg.Done()
			params := &mdns.QueryParam{
				Service: svc,
				Domain:  "local",
				Entries: entriesCh,
				Timeout: time.Duration(s.timeout) * time.Second,
			}
			// 查询失败（如无组播路由）不致命，忽略错误
			_ = mdns.Query(params)
		}(service)
	}
	wg.Wait()
	close(entriesCh)

	devices := <-done
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
		name := strings.TrimSuffix(entry.Name, ".local")
		device.Hostname = strings.TrimSuffix(name, ".")
	}

	if entry.Info != "" {
		device.Vendor = entry.Info
	}

	return device
}

// QuerySpecificService 查询特定 mDNS 服务
func QuerySpecificService(service string, timeout int) ([]*Device, error) {
	entries := make(chan *mdns.ServiceEntry, 64)
	done := make(chan []*Device, 1)

	go func() {
		var devices []*Device
		for entry := range entries {
			if entry.AddrV4 == nil {
				continue
			}
			if device := parseServiceEntry(entry); device != nil {
				devices = append(devices, device)
			}
		}
		done <- devices
	}()

	params := &mdns.QueryParam{
		Service: service,
		Domain:  "local",
		Entries: entries,
		Timeout: time.Duration(timeout) * time.Second,
	}
	err := mdns.Query(params)
	close(entries)
	devices := <-done
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
