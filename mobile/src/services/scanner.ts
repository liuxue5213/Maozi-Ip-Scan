import { NativeModules, Platform } from 'react-native'
import TcpSocket from 'react-native-tcp-socket'
import { DeviceInfo, getNetworkInfo, generateCIDR, incrementIP, getBroadcastIP, lookupVendor } from './network'

// 移动端常用端口（精简版，避免扫描过慢）
const MOBILE_SCAN_PORTS = [22, 80, 443, 445, 3389, 8080, 21, 23, 53, 3306, 5432, 5900, 6379, 8443]

// 端口 -> 服务名称
const PORT_SERVICE: Record<string, string> = {
  '21': 'FTP', '22': 'SSH', '23': 'Telnet', '25': 'SMTP', '53': 'DNS',
  '80': 'HTTP', '110': 'POP3', '135': 'MS-RPC', '139': 'NetBIOS', '143': 'IMAP',
  '443': 'HTTPS', '445': 'SMB', '993': 'IMAPS', '995': 'POP3S',
  '1433': 'MSSQL', '3306': 'MySQL', '3389': 'RDP', '5432': 'PostgreSQL',
  '5900': 'VNC', '6379': 'Redis', '8080': 'HTTP-Proxy', '8443': 'HTTPS-Alt',
  '27017': 'MongoDB',
}

export function getServiceName(port: number): string {
  return PORT_SERVICE[String(port)] || 'Unknown'
}

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
  onDeviceFound?: (device: DeviceInfo) => void,
  portScan?: boolean
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

	const devices = Array.from(deviceMap.values())

	// 端口扫描（可选）
	if (portScan && devices.length > 0) {
		await scanDevicePorts(devices, onProgress)
	}

	return devices
}

// 端口扫描：对设备列表做 TCP connect 扫描
async function scanDevicePorts(
	devices: DeviceInfo[],
	onProgress?: (current: number, total: number) => void
): Promise<void> {
	const total = devices.length * MOBILE_SCAN_PORTS.length
	let done = 0

	const concurrency = 20
	const queue: Array<{ ip: string; port: number }> = []
	for (const d of devices) {
		for (const p of MOBILE_SCAN_PORTS) {
			queue.push({ ip: d.ip, port: p })
		}
	}

	async function worker(deviceMap: Map<string, DeviceInfo>) {
		while (queue.length > 0) {
			const job = queue.shift()
			if (!job) break
			const open = await tcpProbe(job.ip, job.port, 2000)
			done++
			onProgress?.(done, total)
			if (open) {
				const d = deviceMap.get(job.ip)
				if (d) {
					d.openPorts = d.openPorts || []
					if (!d.openPorts.includes(job.port)) {
						d.openPorts.push(job.port)
					}
				}
			}
		}
	}

	const deviceMap = new Map(devices.map(d => [d.ip, d]))
	const workers = Array.from({ length: concurrency }, () => worker(deviceMap))
	await Promise.all(workers)

	// 排序端口
	for (const d of devices) {
		if (d.openPorts) {
			d.openPorts.sort((a, b) => a - b)
		}
	}
}

// TCP connect 探测单个端口（手动超时控制，避免 ConnectionOptions 兼容问题）
function tcpProbe(ip: string, port: number, timeoutMs: number): Promise<boolean> {
	return new Promise(resolve => {
		let socket: ReturnType<typeof TcpSocket.createConnection> | null = null
		let resolved = false
		let timer: ReturnType<typeof setTimeout> | null = null

		const finish = (result: boolean) => {
			if (resolved) return
			resolved = true
			if (timer) clearTimeout(timer)
			if (socket) {
				try { socket.destroy() } catch { /* ignore */ }
			}
			resolve(result)
		}

		try {
			socket = TcpSocket.createConnection({ port, host: ip }, () => finish(true))
			socket.on('error', () => finish(false))
			timer = setTimeout(() => finish(false), timeoutMs)
		} catch {
			finish(false)
		}
	})
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
