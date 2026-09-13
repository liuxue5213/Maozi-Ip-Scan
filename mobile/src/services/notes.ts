import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = '@maozi_notes'

export interface DeviceNote {
  ip: string
  mac?: string
  name: string
  note: string
  color: string
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

// 备注的存储 key：优先用 MAC（DHCP 换 IP 后备注不丢），无 MAC 时退回 IP
export function noteKey(mac?: string, ip?: string): string {
  return (mac && mac.trim()) || ip || ''
}

// 获取全部备注
export async function getAllNotes(): Promise<Record<string, DeviceNote>> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY)
    if (json) {
      return JSON.parse(json)
    }
  } catch {
    // ignore
  }
  return {}
}

// 获取单条备注
export async function getNote(mac?: string, ip?: string): Promise<DeviceNote | null> {
  const all = await getAllNotes()
  return all[noteKey(mac, ip)] || null
}

// 保存备注
export async function saveNote(note: DeviceNote): Promise<void> {
  const all = await getAllNotes()
  const key = noteKey(note.mac, note.ip)
  if (!key) return
  all[key] = note
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

// 删除备注
export async function deleteNote(mac?: string, ip?: string): Promise<void> {
  const all = await getAllNotes()
  delete all[noteKey(mac, ip)]
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}
