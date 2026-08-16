import axios, { type AxiosResponse } from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export interface DeviceNote {
  ip: string
  name: string
  note: string
  color: string
}

export interface APIResponse<T = any> {
  success: boolean
  message?: string
  data?: T
}

// 标签颜色选项
export const NOTE_COLORS = [
  { label: '无', value: '' },
  { label: '红色', value: '#f56c6c' },
  { label: '橙色', value: '#e6a23c' },
  { label: '黄色', value: '#f8d46a' },
  { label: '绿色', value: '#67c23a' },
  { label: '蓝色', value: '#409eff' },
  { label: '紫色', value: '#8e7cc3' },
]

export const notesApi = {
  getAll(): Promise<AxiosResponse<APIResponse<Record<string, DeviceNote>>>> {
    return request.get('/notes')
  },

  save(note: DeviceNote): Promise<AxiosResponse<APIResponse<DeviceNote>>> {
    return request.post('/notes', note)
  },

  delete(ip: string): Promise<AxiosResponse<APIResponse>> {
    return request.delete(`/notes/${ip}`)
  }
}

export default notesApi
