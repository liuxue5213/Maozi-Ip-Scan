import axios, { type AxiosResponse } from 'axios'

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

export interface ScanStatus {
  scanning: boolean
  deviceCount: number
  lastError?: string
  lastScan?: number
}

export interface APIResponse<T = any> {
  success: boolean
  message?: string
  data?: T
}

// API 方法
export const api = {
  // 获取网络接口列表
  getInterfaces(): Promise<AxiosResponse<APIResponse<NetworkInterface[]>>> {
    return request.get('/interfaces')
  },

  // 启动扫描
  startScan(config: ScanConfig): Promise<AxiosResponse<APIResponse>> {
    return request.post('/scan', config)
  },

  // 获取扫描状态（scanning 为 false 表示本轮扫描已结束，即使结果为空）
  getScanStatus(): Promise<AxiosResponse<APIResponse<ScanStatus>>> {
    return request.get('/scan/status')
  },

  // 获取设备列表
  getDevices(): Promise<AxiosResponse<APIResponse<Device[]>>> {
    return request.get('/devices')
  },

  // Ping 单个 IP
  ping(ip: string): Promise<AxiosResponse<APIResponse>> {
    return request.get('/ping', { params: { ip } })
  },

  // 健康检查
  health(): Promise<AxiosResponse<APIResponse>> {
    return request.get('/health')
  }
}

export default api
