import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { NetworkInterface, Device, ScanConfig, APIResponse } from '@/api/scan'

export const useScanStore = defineStore('scan', () => {
  // 状态
  const interfaces = ref<NetworkInterface[]>([])
  const devices = ref<Device[]>([])
  const selectedInterface = ref<NetworkInterface | null>(null)
  const scanning = ref(false)
  const scanProgress = ref(0)
  const cidr = ref('')
  const selectedModes = ref<string[]>(['arp', 'icmp', 'mdns'])
  const error = ref('')

  // 计算属性
  const deviceCount = computed(() => devices.value.length)
  const onlineDevices = computed(() => devices.value.filter(d => d.status === 'online'))

  // 加载网络接口
  async function loadInterfaces() {
    try {
      const res = await api.getInterfaces()
      if (res.data?.success) {
        interfaces.value = res.data.data || []
        if (interfaces.value.length > 0 && !selectedInterface.value) {
          // 优先选择 WiFi，其次以太网
          const wifi = interfaces.value.find(i => i.type === 'wifi')
          const eth = interfaces.value.find(i => i.type === 'ethernet')
          selectedInterface.value = wifi || eth || interfaces.value[0]
          if (selectedInterface.value.ips.length > 0) {
            cidr.value = generateCIDR(selectedInterface.value.ips[0])
          }
        }
      }
    } catch (e: any) {
      error.value = e.message
    }
  }

  // 生成 CIDR
  function generateCIDR(ip: string): string {
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
    }
    return '192.168.1.0/24'
  }

  // 选择接口
  function selectInterface(iface: NetworkInterface) {
    selectedInterface.value = iface
    if (iface.ips.length > 0) {
      cidr.value = generateCIDR(iface.ips[0])
    }
  }

  // 开始扫描
  async function startScan() {
    if (!selectedInterface.value) {
      error.value = '请先选择网络接口'
      return
    }

    scanning.value = true
    scanProgress.value = 0
    error.value = ''
    devices.value = []

    try {
      const config: ScanConfig = {
        interface: selectedInterface.value.name,
        cidr: cidr.value,
        modes: selectedModes.value,
        timeout: 5
      }

      const startRes = await api.startScan(config)
      if (!startRes.data?.success) {
        error.value = startRes.data?.message || '启动扫描失败'
        scanning.value = false
        return
      }

      // 轮询后端扫描状态：scanning 变为 false 即结束（0 台设备也能正确终止）
      await new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
          scanProgress.value = Math.min(scanProgress.value + 5, 90)
          try {
            const res = await api.getScanStatus()
            if (res.data?.success && res.data.data && !res.data.data.scanning) {
              clearInterval(interval)
              resolve()
            }
          } catch {
            // 单次轮询失败不中断，继续等下一个周期
          }
        }, 1000)

        // 安全兜底：最长等待 120 秒（mDNS 并行查询后单轮扫描通常 < 10 秒）
        setTimeout(() => {
          clearInterval(interval)
          resolve()
        }, 120000)
      })

      await refreshDevices()
    } catch (e: any) {
      error.value = e.message
    } finally {
      scanProgress.value = 100
      scanning.value = false
    }
  }

  // 刷新设备列表
  async function refreshDevices() {
    try {
      const res = await api.getDevices()
      if (res.data?.success) {
        devices.value = res.data.data || []
      }
    } catch (e: any) {
      error.value = e.message
    }
  }

  // Ping 单个设备
  async function ping(ip: string): Promise<APIResponse> {
    try {
      const res = await api.ping(ip)
      return res.data
    } catch (e: any) {
      return { success: false, message: e.message, data: { ip, online: false } }
    }
  }

  return {
    interfaces,
    devices,
    selectedInterface,
    scanning,
    scanProgress,
    cidr,
    selectedModes,
    error,
    deviceCount,
    onlineDevices,
    loadInterfaces,
    selectInterface,
    startScan,
    refreshDevices,
    generateCIDR,
    ping
  }
})
