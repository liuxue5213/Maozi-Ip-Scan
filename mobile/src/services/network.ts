import { NativeModules, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'

// 设备信息类型
export interface DeviceInfo {
  ip: string
  mac: string
  hostname: string
  vendor: string
  status: 'online' | 'offline'
  source: string
}

// 网络信息
export interface NetworkInfo {
  ssid: string | null
  ipAddress: string | null
  subnetMask: string | null
  gateway: string | null
  type: string
}

// 获取当前网络信息
export async function getNetworkInfo(): Promise<NetworkInfo> {
  const state = await NetInfo.fetch()
  
  return {
    ssid: (state.details as any)?.ssid || null,
    ipAddress: (state.details as any)?.ipAddress || null,
    subnetMask: (state.details as any)?.subnet || null,
    gateway: (state.details as any)?.gateway || null,
    type: state.type
  }
}

// 根据 IP 生成 CIDR
export function generateCIDR(ip: string): string {
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
  }
  return '192.168.1.0/24'
}

// 解析子网掩码为前缀长度
export function subnetToPrefix(mask: string): number {
  const parts = mask.split('.')
  let prefix = 0
  for (const part of parts) {
    prefix += parseInt(part, 10).toString(2).split('1').length - 1
  }
  return prefix
}

// MAC 厂商识别（简化版）
const vendorMap: Record<string, string> = {
  'b8:27:eb': 'Raspberry Pi',
  'dc:a6:32': 'Raspberry Pi',
  'e4:5f:01': 'Raspberry Pi',
  '00:50:56': 'VMware',
  '00:0c:29': 'VMware',
  '08:00:27': 'VirtualBox',
  'f8:1a:67': 'TP-Link',
  '50:c7:bf': 'TP-Link',
  'ac:84:c6': 'TP-Link',
  '64:66:b3': 'TP-Link',
  '5c:e8:eb': 'Samsung',
  'ac:5f:3e': 'Samsung',
  '3c:5a:b4': 'Google',
  '54:60:09': 'Google',
  '94:94:26': 'Apple',
  'f0:18:98': 'Apple',
  '88:e9:fe': 'Apple',
  'a4:83:e7': 'Apple',
  '80:e6:50': 'Apple',
  '78:4f:43': 'Apple',
  '00:17:c4': 'Netgear',
  '20:e5:2a': 'Netgear',
  '60:38:e0': 'Netgear',
  '9c:3d:cf': 'Netgear',
  '04:a1:51': 'Netgear',
  '28:c6:8e': 'Netgear',
  '00:8e:f2': 'Huawei',
  '30:d1:6b': 'Huawei',
  '78:d7:52': 'Huawei',
  '88:50:dd': 'Huawei',
  '28:6e:d4': 'Huawei',
  '9c:28:bf': 'Xiaomi',
  '7c:49:eb': 'Xiaomi',
  '4c:34:88': 'Xiaomi',
  'ac:cf:85': 'Xiaomi',
  '3c:bd:3e': 'Xiaomi',
  'f0:b4:29': 'Xiaomi',
  '28:6c:07': 'Xiaomi',
  '18:f0:e4': 'Xiaomi',
  '00:9e:c8': 'Xiaomi',
  'b0:a7:32': 'Intel',
  '4c:79:6e': 'Intel',
  '8c:85:90': 'Intel',
  '00:1e:65': 'Intel',
  '00:21:5d': 'Intel',
}

// 查找 MAC 厂商
export function lookupVendor(mac: string): string {
  if (!mac) return ''
  const prefix = mac.toLowerCase().substring(0, 8)
  return vendorMap[prefix] || ''
}

// IP 地址递增
export function incrementIP(ip: string): string {
  const parts = ip.split('.').map(Number)
  for (let i = parts.length - 1; i >= 0; i--) {
    parts[i]++
    if (parts[i] <= 255) break
    parts[i] = 0
  }
  return parts.join('.')
}

// 计算广播地址
export function getBroadcastIP(cidr: string): string {
  const [ip, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  const ipParts = ip.split('.').map(Number)
  const mask = ~(Math.pow(2, 32 - prefix) - 1)
  
  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]
  const broadcast = (ipNum | ~mask) >>> 0
  
  return [
    (broadcast >>> 24) & 0xff,
    (broadcast >>> 16) & 0xff,
    (broadcast >>> 8) & 0xff,
    broadcast & 0xff
  ].join('.')
}

export default {
  getNetworkInfo,
  generateCIDR,
  subnetToPrefix,
  lookupVendor,
  incrementIP,
  getBroadcastIP
}
