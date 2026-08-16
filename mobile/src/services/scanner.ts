import { NativeModules, Platform } from 'react-native'
import { DeviceInfo, getNetworkInfo, generateCIDR, incrementIP, getBroadcastIP, lookupVendor } from './network'

// 从原生模块读取 ARP 表
const { ArpModule } = NativeModules

// ARP 表项
interface ArpEntry {
  ip: string
  mac: string
  device: string
}

// 读取系统 ARP 表
export async function readArpTable(): Promise<DeviceInfo[]> {
  if (Platform.OS !== 'android') return []
  
  try {
    const entries: ArpEntry[] = await ArpModule.getArpTable()
    return entries
      .filter(e => e.mac && e.mac !== '00:00:00:00:00:00')
      .map(e => ({
        ip: e.ip,
        mac: e.mac,
        hostname: '',
        vendor: lookupVendor(e.mac),
        status: 'online',
        source: 'arp'
      }))
  } catch (e) {
    console.warn('Read ARP table failed:', e)
    return []
  }
}

// Ping 扫描（通过原生模块）
export async function pingSweep(
  cidr: string,
  onProgress?: (current: number, total: number) => void
): Promise<DeviceInfo[]> {
  const [network, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  
  const totalIPs = Math.pow(2, 32 - prefix) - 2
  const devices: DeviceInfo[] = []
  
  // 使用并发 ping
  const concurrency = 20
  const ip = network.split('.').map(Number)
  let currentIP = `${ip[0]}.${ip[1]}.${ip[2]}.1`
  const broadcast = getBroadcastIP(cidr)
  
  let scanned = 0
  
  while (currentIP !== broadcast) {
    const batch: string[] = []
    for (let i = 0; i < concurrency && currentIP !== broadcast; i++) {
      if (!currentIP.startsWith('127.')) {
        batch.push(currentIP)
      }
      currentIP = incrementIP(currentIP)
      scanned++
    }
    
    // 并发 ping 一批
    const results = await Promise.all(batch.map(ip => pingHost(ip)))
    results.forEach((online, idx) => {
      if (online) {
        devices.push({
          ip: batch[idx],
          mac: '',
          hostname: '',
          vendor: '',
          status: 'online',
          source: 'icmp'
        })
      }
    })
    
    onProgress?.(scanned, totalIPs)
    
    // 控制扫描速度
    await sleep(10)
  }
  
  return devices
}

// 单个主机 ping
export async function pingHost(ip: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  
  try {
    return await ArpModule.ping(ip, 1000)
  } catch {
    return false
  }
}

// 综合扫描
export async function scanNetwork(
  cidr: string,
  modes: string[],
  onProgress?: (current: number, total: number) => void,
  onDeviceFound?: (device: DeviceInfo) => void
): Promise<DeviceInfo[]> {
  const deviceMap = new Map<string, DeviceInfo>()
  
  // ARP 扫描
  if (modes.includes('arp')) {
    const arpDevices = await readArpTable()
    arpDevices.forEach(d => {
      // 检查是否在目标网段内
      if (isIPInCIDR(d.ip, cidr)) {
        deviceMap.set(d.ip, d)
        onDeviceFound?.(d)
      }
    })
  }
  
  // ICMP 扫描
  if (modes.includes('icmp')) {
    const icmpDevices = await pingSweep(cidr, onProgress)
    icmpDevices.forEach(d => {
      if (deviceMap.has(d.ip)) {
        // 合并信息
        const existing = deviceMap.get(d.ip)!
        if (!existing.hostname && d.hostname) {
          existing.hostname = d.hostname
        }
      } else {
        deviceMap.set(d.ip, d)
        onDeviceFound?.(d)
      }
    })
  }
  
  return Array.from(deviceMap.values())
}

// 检查 IP 是否在 CIDR 范围内
function isIPInCIDR(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  
  const ipNum = ipToNumber(ip)
  const netNum = ipToNumber(network)
  const mask = ~(Math.pow(2, 32 - prefix) - 1) >>> 0
  
  return (ipNum & mask) === (netNum & mask)
}

// IP 转数字
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

// 延迟
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default {
  readArpTable,
  pingSweep,
  pingHost,
  scanNetwork
}
