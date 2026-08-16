package scanner

import (
	"fmt"
	"net"
	"strings"
)

// GetInterfaces 获取所有网络接口
func GetInterfaces() ([]*NetworkInterface, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	var result []*NetworkInterface
	for _, iface := range ifaces {
		// 跳过未启动的接口
		if iface.Flags&net.FlagUp == 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		var ips []string
		for _, addr := range addrs {
			if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
				if ipNet.IP.To4() != nil {
					ips = append(ips, ipNet.IP.String())
				}
			}
		}

		nif := &NetworkInterface{
			Name:        iface.Name,
			DisplayName: iface.Name,
			MAC:         iface.HardwareAddr.String(),
			IPs:         ips,
			IsUp:        true,
			Type:        detectInterfaceType(iface.Name),
		}

		// 跳过没有 IP 的接口
		if len(nif.IPs) > 0 && nif.MAC != "" {
			result = append(result, nif)
		}
	}

	return result, nil
}

// detectInterfaceType 根据接口名猜测网络类型
func detectInterfaceType(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "wlan") || strings.Contains(lower, "wi-fi") ||
		strings.Contains(lower, "wlp") || strings.Contains(lower, "ath"):
		return "wifi"
	case strings.Contains(lower, "eth") || strings.Contains(lower, "en") ||
		strings.Contains(lower, "ens") || strings.Contains(lower, "enp"):
		return "ethernet"
	case strings.Contains(lower, "lo"):
		return "loopback"
	default:
		return "other"
	}
}

// GetInterfaceByName 获取指定名称的接口
func GetInterfaceByName(name string) (*NetworkInterface, error) {
	ifaces, err := GetInterfaces()
	if err != nil {
		return nil, err
	}
	for _, iface := range ifaces {
		if iface.Name == name {
			return iface, nil
		}
	}
	return nil, fmt.Errorf("interface %s not found", name)
}

// GetLocalIPs 获取本机所有 IPv4 地址
func GetLocalIPs() []string {
	var ips []string
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
				if ipNet.IP.To4() != nil {
					ips = append(ips, ipNet.IP.String())
				}
			}
		}
	}
	return ips
}
