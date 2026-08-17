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

	const CONCURRENCY = 30
	const queue: Array<{ ip: string; port: number }> = []
	for (const d of devices) {
		for (const p of MOBILE_SCAN_PORTS) {
			queue.push({ ip: d.ip, port: p })
		}
	}

	// 每个设备的端口结果暂存
	const portResultMap = new Map<string, Array<{ port: number; state: 'open' | 'closed' | 'filtered'; banner?: string }>>()
	for (const d of devices) {
		portResultMap.set(d.ip, [])
	}

	async function worker() {
		while (queue.length > 0) {
			const job = queue.shift()
			if (!job) break
			const result = await tcpProbe(job.ip, job.port, 2000)
			done++
			if (done % 5 === 0 || queue.length === 0) {
				onProgress?.(done, total)
			}
			portResultMap.get(job.ip)?.push({ port: job.port, ...result })
		}
	}

	const workers = Array.from({ length: CONCURRENCY }, () => worker())
	await Promise.all(workers)

	// 合并结果到设备
	for (const d of devices) {
		const results = portResultMap.get(d.ip) || []
		results.sort((a, b) => a.port - b.port)

		// 新版详细端口列表
		d.ports = results.map(r => ({
			port: r.port,
			state: r.state,
			service: getServiceName(r.port),
			banner: r.banner
		}))

		// 兼容旧版 openPorts（仅开放的）
		d.openPorts = results.filter(r => r.state === 'open').map(r => r.port)

		// 推断设备类型/系统
		const fingerprint = fingerprintDevice(d, results)
		d.deviceType = fingerprint.deviceType
		d.osName = fingerprint.osName
	}
}

// TCP connect 探测单个端口，返回状态 + 抓取到的 banner
function tcpProbe(ip: string, port: number, timeoutMs: number): Promise<{ state: 'open' | 'closed' | 'filtered'; banner?: string }> {
	return new Promise(resolve => {
		let socket: ReturnType<typeof TcpSocket.createConnection> | null = null
		let resolved = false
		let timer: ReturnType<typeof setTimeout> | null = null
		let banner = ''

		const finish = (state: 'open' | 'closed' | 'filtered') => {
			if (resolved) return
			resolved = true
			if (timer) clearTimeout(timer)
			if (socket) {
				try { socket.destroy() } catch { /* ignore */ }
			}
			// 仅 open 端口返回 banner
			resolve(state === 'open' ? { state, banner: banner || undefined } : { state })
		}

		try {
			socket = TcpSocket.createConnection({ port, host: ip }, () => {
				// 连接成功 = open，尝试抓取 banner
				socket!.setTimeout(timeoutMs)
				socket!.on('data', (data: Buffer | string) => {
					const text = typeof data === 'string' ? data : data.toString('utf-8')
					if (!banner) banner = text.slice(0, 200).replace(/[\r\n]/g, ' ').trim()
					// 拿到 banner 就可以关了
					finish('open')
				})
				// 有些服务不发 banner，等一小段时间没数据就判定 open
				timer = setTimeout(() => finish('open'), Math.min(timeoutMs, 1500))
			})
			socket.on('error', (err: any) => {
				// ECONNRESET = closed（端口关闭），其他 = 可能 filtered
				const msg = String(err?.message || '')
				if (msg.includes('ECONNRESET') || msg.includes('Connection refused')) {
					finish('closed')
				} else {
					finish('filtered')
				}
			})
			socket.on('timeout', () => finish('filtered'))
		} catch {
			finish('filtered')
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

// 根据开放端口推断设备类型和操作系统（类似 nmap -O 的简化版）
function fingerprintDevice(
	device: DeviceInfo,
	portResults: Array<{ port: number; state: 'open' | 'closed' | 'filtered' }>
): { deviceType: string; osName: string } {
	const openPorts = new Set(portResults.filter(r => r.state === 'open').map(r => r.port))
	const filteredPorts = new Set(portResults.filter(r => r.state === 'filtered').map(r => r.port))

	// 设备类型推断
	if (openPorts.has(9100) || openPorts.has(515) || openPorts.has(631)) {
		return { deviceType: '打印机', osName: guessOS(openPorts) }
	}
	if (openPorts.has(554) || openPorts.has(8554) || openPorts.has(37777) || openPorts.has(9000)) {
		return { deviceType: '摄像头/NVR', osName: guessOS(openPorts) }
	}
	if (openPorts.has(80) || openPorts.has(443) || openPorts.has(8080) || openPorts.has(8443)) {
		// 可能是路由器/智能设备/Web 服务器
		if (openPorts.has(22) && openPorts.has(80)) {
			return { deviceType: '路由器/网关', osName: guessOS(openPorts) }
		}
		if (openPorts.has(80) || openPorts.has(443)) {
			return { deviceType: 'Web 设备', osName: guessOS(openPorts) }
		}
	}
	if (openPorts.has(3306)) return { deviceType: '数据库服务器', osName: 'MySQL' }
	if (openPorts.has(5432)) return { deviceType: '数据库服务器', osName: 'PostgreSQL' }
	if (openPorts.has(6379)) return { deviceType: '缓存服务器', osName: 'Redis' }
	if (openPorts.has(27017)) return { deviceType: '数据库服务器', osName: 'MongoDB' }
	if (openPorts.has(1433)) return { deviceType: '数据库服务器', osName: 'MSSQL' }
	if (openPorts.has(5900) || openPorts.has(5901)) return { deviceType: '远程桌面', osName: guessOS(openPorts) }
	if (openPorts.has(3389)) return { deviceType: '远程桌面', osName: 'Windows' }
	if (openPorts.has(445) || openPorts.has(139) || openPorts.has(135)) {
		return { deviceType: '文件服务器', osName: 'Windows' }
	}
	if (openPorts.has(21) && openPorts.has(22)) {
		return { deviceType: '文件/开发服务器', osName: guessOS(openPorts) }
	}
	if (openPorts.has(22)) {
		return { deviceType: 'Linux/Unix 服务器', osName: guessOS(openPorts) }
	}
	if (openPorts.has(53)) return { deviceType: 'DNS 服务器', osName: guessOS(openPorts) }

	// 有过滤端口但没有开放端口 → 可能是防火墙后的设备
	if (filteredPorts.size > 0 && openPorts.size === 0) {
		return { deviceType: '防火墙/安全设备', osName: 'Unknown' }
	}

	return { deviceType: 'Unknown', osName: guessOS(openPorts) }
}

// 根据端口组合推断操作系统
function guessOS(openPorts: Set<number>): string {
	if (openPorts.has(3389) || openPorts.has(445) || openPorts.has(135) || openPorts.has(139)) return 'Windows'
	if (openPorts.has(22) && !openPorts.has(3389)) {
		// 22 常见于 Linux/Unix，也可能是网络设备
		if (openPorts.has(80) || openPorts.has(443) || openPorts.has(8080)) return 'Linux/Unix'
		return 'Linux/Unix/网络设备'
	}
	if (openPorts.has(80) || openPorts.has(443) || openPorts.has(8080)) return 'Linux/Unix'
	return 'Unknown'
}

export default {
  readArpTable,
  pingSweep,
  pingHost,
  scanNetwork
}
