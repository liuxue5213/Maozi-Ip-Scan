import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 类型定义
export interface NetworkInterface {
  name: string
  displayName: string
  mac: string
  ips: string[]
  isUp: boolean
  type: 'wifi' | 'ethernet' | 'loopback' | 'other'
}

export interface Device {
  ip: string
  mac: string
  hostname: string
  vendor: string
  status: string
  firstSeen: string
  lastSeen: string
  openPorts?: number[]
  source: string
}

export interface ScanConfig {
  interface: string
  cidr: string
  modes: string[]
  timeout: number
  portScan?: boolean
  commonPorts?: number[]
}

export interface APIResponse<T = any> {
  success: boolean
  message?: string
  data?: T
}

// API 方法
export const api = {
  // 获取网络接口列表
  getInterfaces(): Promise<APIResponse<NetworkInterface[]>> {
    return request.get('/interfaces')
  },

  // 启动扫描
  startScan(config: ScanConfig): Promise<APIResponse> {
    return request.post('/scan', config)
  },

  // 获取设备列表
  getDevices(): Promise<APIResponse<Device[]>> {
    return request.get('/devices')
  },

  // Ping 单个 IP
  ping(ip: string): Promise<APIResponse> {
    return request.get('/ping', { params: { ip } })
  },

  // 健康检查
  health(): Promise<APIResponse> {
    return request.get('/health')
  }
}

export default api
