<template>
  <div class="scan-view">
    <!-- 扫描控制面板 -->
    <div class="card">
      <div class="card-title">📡 扫描控制</div>
      
      <div class="scan-form">
        <div class="form-item">
          <label>网络接口</label>
          <el-select
            v-model="selectedIdx"
            placeholder="选择网络接口"
            @change="onInterfaceChange"
            style="width: 100%"
          >
            <el-option
              v-for="(iface, idx) in scanStore.interfaces"
              :key="iface.name"
              :label="`${iface.name} (${iface.type}) - ${iface.ips.join(', ')}`"
              :value="idx"
            >
              <span>
                <el-tag size="small" :type="iface.type === 'wifi' ? 'success' : 'info'">
                  {{ iface.type }}
                </el-tag>
                {{ iface.name }} - {{ iface.ips.join(', ') }}
              </span>
            </el-option>
          </el-select>
        </div>

        <div class="form-item">
          <label>目标网段 (CIDR)</label>
          <el-input v-model="scanStore.cidr" placeholder="如 192.168.1.0/24">
            <template #append>
              <el-button @click="autoDetectCIDR">自动检测</el-button>
            </template>
          </el-input>
        </div>

        <div class="form-item">
          <label>扫描模式</label>
          <el-checkbox-group v-model="scanStore.selectedModes">
            <el-checkbox label="arp">ARP</el-checkbox>
            <el-checkbox label="icmp">ICMP</el-checkbox>
            <el-checkbox label="mdns">mDNS</el-checkbox>
          </el-checkbox-group>
        </div>

        <div class="form-item">
          <el-checkbox v-model="scanStore.portScan">
            端口扫描
          </el-checkbox>
          <div class="form-hint">扫描常见服务端口（SSH/HTTP/HTTPS/SMB 等），会增加扫描时间</div>
        </div>

        <div class="form-item">
          <el-button
            type="primary"
            size="large"
            :loading="scanStore.scanning"
            @click="handleScan"
          >
            <el-icon><Search /></el-icon>
            {{ scanStore.scanning ? '扫描中...' : '开始扫描' }}
          </el-button>
          <el-button size="large" @click="scanStore.refreshDevices()">
            <el-icon><Refresh /></el-icon>
            刷新结果
          </el-button>
        </div>
      </div>

      <!-- 进度条 -->
      <div v-if="scanStore.scanning" class="progress-bar">
        <el-progress :percentage="scanStore.scanProgress" :stroke-width="15" striped striped-flow />
      </div>

      <!-- 错误提示 -->
      <el-alert
        v-if="scanStore.error"
        :title="scanStore.error"
        type="error"
        show-icon
        closable
        @close="scanStore.error = ''"
        style="margin-top: 12px"
      />
    </div>

    <!-- 扫描结果 -->
    <div class="card">
      <div class="card-title">
        📋 扫描结果
        <el-tag type="success" size="small" style="margin-left: 10px">
          发现 {{ scanStore.deviceCount }} 台设备
        </el-tag>
      </div>

      <div v-if="scanStore.devices.length === 0" class="empty-state">
        <el-empty description="暂无扫描结果，点击「开始扫描」" />
      </div>

      <div v-else class="device-grid">
        <div
          v-for="device in scanStore.devices"
          :key="device.ip"
          class="device-card"
          :class="{ offline: device.status === 'offline' }"
          @click="goToSSH(device)"
        >
          <div class="device-ip">
            <el-icon><Monitor /></el-icon>
            {{ device.ip }}
          </div>
          <div class="device-mac">{{ device.mac || 'N/A' }}</div>
          <div class="device-vendor" v-if="device.vendor !== 'Unknown'">
            🏷️ {{ device.vendor }}
          </div>
          <div class="device-hostname" v-if="device.hostname">
            🖥️ {{ device.hostname }}
          </div>
          <div class="device-ports" v-if="device.openPorts && device.openPorts.length">
            <el-tag
              v-for="port in device.openPorts"
              :key="port"
              size="small"
              type="warning"
              effect="plain"
              style="margin: 2px 2px 0 0"
            >
              {{ port }}
            </el-tag>
          </div>
          <span class="device-source">{{ device.source }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Refresh, Monitor } from '@element-plus/icons-vue'
import { useScanStore } from '@/stores/scan'

const router = useRouter()
const scanStore = useScanStore()
const selectedIdx = ref(0)

onMounted(async () => {
  await scanStore.loadInterfaces()
})

function onInterfaceChange(idx: number) {
  const iface = scanStore.interfaces[idx]
  if (iface) {
    scanStore.selectInterface(iface)
  }
}

function autoDetectCIDR() {
  if (scanStore.selectedInterface?.ips.length) {
    scanStore.cidr = scanStore.generateCIDR(scanStore.selectedInterface.ips[0])
  }
}

function handleScan() {
  scanStore.startScan()
}

function goToSSH(device: any) {
  router.push({
    name: 'ssh',
    query: { host: device.ip }
  })
}
</script>

<style scoped>
.scan-view {
  max-width: 100%;
}

.scan-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.form-item label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #606266;
}

.progress-bar {
  margin-top: 16px;
}

.empty-state {
  padding: 40px 0;
}
</style>
