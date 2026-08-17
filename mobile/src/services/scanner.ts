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

// Ping 扫描（工作池模式：N 个 worker 持续消费队列，不会整批等最慢的）
export async function pingSweep(
  cidr: string,
  onProgress?: (current: number, total: number) => void,
  onFound?: (device: DeviceInfo) => void
): Promise<DeviceInfo[]> {
  const [network, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)

  // 生成待扫描 IP 队列（跳过网络地址和广播地址）
  const queue: string[] = []
  const ipParts = network.split('.').map(Number)
  let currentIP = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.1`
  const broadcast = getBroadcastIP(cidr)
  while (currentIP !== broadcast) {
    if (!currentIP.startsWith('127.')) {
      queue.push(currentIP)
    }
    currentIP = incrementIP(currentIP)
  }
  const total = queue.length

  const devices: DeviceInfo[] = []
  let scanned = 0
  const CONCURRENCY = 100 // 并发 worker 数

  const worker = async () => {
    while (queue.length > 0) {
      const target = queue.shift()
      if (!target) break

      const online = await pingHost(target)
      scanned++

      if (online) {
        const device: DeviceInfo = {
          ip: target,
          mac: '',
          hostname: '',
          vendor: '',
          status: 'online',
          source: 'icmp'
        }
        devices.push(device)
        onFound?.(device)
      }

      if (scanned % 10 === 0 || queue.length === 0) {
        onProgress?.(scanned, total)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  onProgress?.(total, total)
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

	// ARP 表读取与 ICMP 扫描并行执行
	const arpTask = modes.includes('arp') ? readArpTable() : Promise.resolve([] as DeviceInfo[])
	const icmpTask = modes.includes('icmp')
		? pingSweep(cidr, onProgress, (d) => {
				// ICMP 发现的设备立即上报（增量 UI）
				if (isIPInCIDR(d.ip, cidr)) {
					onDeviceFound?.(d)
				}
			})
		: Promise.resolve([] as DeviceInfo[])

	const [arpDevices, icmpDevices] = await Promise.all([arpTask, icmpTask])

	// 先合入 ARP 结果（带 MAC/厂商信息）
	arpDevices.forEach(d => {
		if (isIPInCIDR(d.ip, cidr)) {
			deviceMap.set(d.ip, d)
			onDeviceFound?.(d)
		}
	})

	// 再合入 ICMP 结果（无 MAC，等下一步回填）
	icmpDevices.forEach(d => {
		if (!deviceMap.has(d.ip)) {
			deviceMap.set(d.ip, d)
		}
	})

	// ping 扫描会触发系统解析 ARP，再读一次补全 MAC/厂商，
	// 还能捞到 isReachable 漏掉但 ARP 已解析的设备
	if (modes.includes('arp')) {
		const refreshed = await readArpTable()
		refreshed.forEach(d => {
			if (!isIPInCIDR(d.ip, cidr)) return
			const existing = deviceMap.get(d.ip)
			if (existing) {
				if (!existing.mac && d.mac) {
					existing.mac = d.mac
					existing.vendor = d.vendor
				}
			} else {
				deviceMap.set(d.ip, d)
			}
		})
	}

	const devices = Array.from(deviceMap.values())

	// 端口扫描（可选，内部已是并发工作池）
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

export default {
  readArpTable,
  pingSweep,
  pingHost,
  scanNetwork
}
