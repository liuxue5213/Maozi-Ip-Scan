package scanner

import (
	"strings"
)

// 常见 MAC 地址前缀（OUI）与厂商映射
var ouiDatabase = map[string]string{
	"00:50:56": "VMware",
	"00:0c:29": "VMware",
	"00:05:69": "VMware",
	"08:00:27": "VirtualBox",
	"0a:00:27": "VirtualBox",
	"b8:27:eb": "Raspberry Pi",
	"dc:a6:32": "Raspberry Pi",
	"e4:5f:01": "Raspberry Pi",
	"00:1a:2b": "Ayecom",
	"f8:1a:67": "TP-Link",
	"50:c7:bf": "TP-Link",
	"ac:84:c6": "TP-Link",
	"00:14:78": "TP-Link",
	"64:66:b3": "TP-Link",
	"9c:a6:15": "TP-Link",
	"c0:4a:00": "TP-Link",
	"5c:e8:eb": "Samsung",
	"ac:5f:3e": "Samsung",
	"3c:5a:b4": "Google",
	"54:60:09": "Google",
	"00:1a:11": "Google",
	"33:33:00": "IPv6 Multicast",
	"01:00:5e": "IPv4 Multicast",
	"94:94:26": "Apple",
	"f0:18:98": "Apple",
	"88:e9:fe": "Apple",
	"a4:83:e7": "Apple",
	"80:e6:50": "Apple",
	"78:4f:43": "Apple",
	"88:66:5a": "Apple",
	"3c:22:fb": "Apple",
	"c8:bc:c8": "Apple",
	"f0:d1:a9": "Apple",
	"04:0c:ce": "Apple",
	"48:bf:6b": "Apple",
	"3c:06:30": "Apple",
	"00:17:c4": "Netgear",
	"20:e5:2a": "Netgear",
	"60:38:e0": "Netgear",
	"9c:3d:cf": "Netgear",
	"04:a1:51": "Netgear",
	"28:c6:8e": "Netgear",
	"00:24:b2": "Netgear",
	"00:26:f2": "Netgear",
	"74:44:01": "Netgear",
	"e8:fc:af": "Netgear",
	"e0:46:9a": "Netgear",
	"00:22:3f": "Netgear",
	"00:1b:2f": "Netgear",
	"00:8e:f2": "Huawei",
	"30:d1:6b": "Huawei",
	"78:d7:52": "Huawei",
	"00:46:4b": "Huawei",
	"20:54:fa": "Huawei",
	"88:50:dd": "Huawei",
	"28:6e:d4": "Huawei",
	"48:ad:08": "Huawei",
	"c8:9c:dc": "Huawei",
	"e0:cc:7a": "Huawei",
	"9c:28:bf": "Xiaomi",
	"7c:49:eb": "Xiaomi",
	"4c:34:88": "Xiaomi",
	"ac:cf:85": "Xiaomi",
	"3c:bd:3e": "Xiaomi",
	"f0:b4:29": "Xiaomi",
	"28:6c:07": "Xiaomi",
	"18:f0:e4": "Xiaomi",
	"00:9e:c8": "Xiaomi",
	"14:f6:5a": "Xiaomi",
	"74:23:44": "Xiaomi",
	"64:09:80": "Xiaomi",
	"0c:82:68": "Xiaomi",
	"20:ab:37": "Xiaomi",
	"b0:e2:35": "Xiaomi",
	"00:09:18": "Hikvision",
	"28:57:be": "Hikvision",
	"44:19:b6": "Hikvision",
	"4c:bd:8f": "Hikvision",
	"24:d7:9c": "Dahua",
	"3c:ef:8c": "Dahua",
	"fc:da:cd": "Dahua",
	"78:a5:04": "Arlo",
	"b0:a7:32": "Intel",
	"4c:79:6e": "Intel",
	"00:1e:65": "Intel",
	"8c:85:90": "Intel",
	"28:6c:07": "Intel",
	"00:21:5d": "Intel",
	"00:22:fa": "Intel",
	"68:05:ca": "Intel",
	"78:ff:57": "Intel",
	"34:13:e8": "Intel",
	"00:1f:3c": "Intel",
	"80:9b:20": "Intel",
	"88:53:2e": "Intel",
	"90:e2:ba": "Intel",
	"c8:f7:33": "Intel",
	"00:26:c7": "Intel",
	"00:26:c6": "Intel",
	"00:0e:35": "Sony",
	"00:13:a9": "Sony",
	"00:1a:80": "Sony",
	"00:1d:ba": "Sony",
	"00:24:be": "Sony",
	"30:17:c8": "Sony",
	"40:b8:37": "Sony",
	"f8:4e:17": "Sony",
	"fc:0f:e6": "Sony",
	"00:21:4d": "Intel",
	"00:21:5c": "Intel",
	"00:22:fb": "Intel",
	"78:0c:b8": "Intel",
	"ac:72:89": "Intel",
	"00:1e:64": "Intel",
	"00:1e:67": "Intel",
	"00:21:6a": "Intel",
	"00:24:d6": "Intel",
	"00:24:d7": "Intel",
	"e0:94:67": "Intel",
	"e0:9d:31": "Intel",
	"4c:34:88": "Intel",
	"80:86:f2": "Intel",
	"00:1b:21": "Intel",
	"00:1c:c0": "Intel",
	"00:1d:e0": "Intel",
	"00:1d:e1": "Intel",
	"00:21:5a": "Intel",
	"00:21:5b": "Intel",
	"00:22:fa": "Intel",
	"00:22:fb": "Intel",
}

// LookupVendor 根据 MAC 地址查询设备厂商
func LookupVendor(mac string) string {
	if mac == "" {
		return ""
	}
	
	// 标准化 MAC 地址
	mac = strings.ToLower(mac)
	mac = strings.ReplaceAll(mac, "-", ":")
	
	// 查找前 3 个字节（OUI）
	parts := strings.Split(mac, ":")
	if len(parts) >= 3 {
		oui := parts[0] + ":" + parts[1] + ":" + parts[2]
		if vendor, ok := ouiDatabase[oui]; ok {
			return vendor
		}
	}
	
	// 也尝试大写版本
	mac = strings.ToUpper(mac)
	parts = strings.Split(mac, ":")
	if len(parts) >= 3 {
		oui := parts[0] + ":" + parts[1] + ":" + parts[2]
		if vendor, ok := ouiDatabase[oui]; ok {
			return vendor
		}
	}
	
	return "Unknown"
}

// LookupVendorAsync 异步查询厂商（支持扩展为在线 API）
func LookupVendorAsync(mac string) <-chan string {
	ch := make(chan string, 1)
	go func() {
		ch <- LookupVendor(mac)
		close(ch)
	}()
	return ch
}
