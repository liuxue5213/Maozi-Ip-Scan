import axios, { type AxiosResponse } from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// ---- 历史记录类型 ----

export interface DeviceSnapshot {
  ip: string
  mac: string
  hostname: string
  vendor: string
  source: string
  openPorts?: number[]
}

export interface HistoryEntry {
  id: string
  time: string
  cidr: string
  modes: string[]
  deviceCount: number
  devices: DeviceSnapshot[]
  scanTimeMs: number
}

export interface HistoryDiff {
  newDevices: DeviceSnapshot[]
  goneDevices: DeviceSnapshot[]
  stableCount: number
}

export interface APIResponse<T = any> {
  success: boolean
  message?: string
  data?: T
}

export const historyApi = {
  // 获取全部历史
  getAll(): Promise<AxiosResponse<APIResponse<HistoryEntry[]>>> {
    return request.get('/history')
  },

  // 对比最近两次扫描
  compare(): Promise<AxiosResponse<APIResponse<HistoryDiff>>> {
    return request.get('/history/compare')
  }
}

export default historyApi
