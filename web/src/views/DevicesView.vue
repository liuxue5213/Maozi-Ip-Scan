<template>
  <div class="devices-view">
    <div class="card">
      <div class="card-title">
        🖥️ 设备列表
        <el-tag type="info" size="small" style="margin-left: 10px">
          共 {{ scanStore.deviceCount }} 台
        </el-tag>
        <el-button
          size="small"
          style="float: right"
          @click="scanStore.refreshDevices()"
        >
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>

      <el-table :data="scanStore.devices" stripe style="width: 100%">
        <el-table-column prop="ip" label="IP 地址" width="150">
          <template #default="{ row }">
            <span class="ip-cell">{{ row.ip }}</span>
            <el-button
              link
              size="small"
              @click="copyText(row.ip)"
              title="复制 IP"
            >
              <el-icon><DocumentCopy /></el-icon>
            </el-button>
          </template>
        </el-table-column>
        
        <el-table-column prop="mac" label="MAC 地址" width="160">
          <template #default="{ row }">
            <code>{{ row.mac || 'N/A' }}</code>
          </template>
        </el-table-column>
        
        <el-table-column prop="hostname" label="主机名" min-width="150">
          <template #default="{ row }">
            {{ row.hostname || '-' }}
          </template>
        </el-table-column>
        
        <el-table-column prop="vendor" label="厂商" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.vendor !== 'Unknown'" size="small" type="primary">
              {{ row.vendor }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="source" label="发现方式" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.source }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : 'info'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              size="small"
              @click="goToSSH(row.ip)"
            >
              <el-icon><Connection /></el-icon>
              SSH
            </el-button>
            <el-button
              link
              size="small"
              @click="pingDevice(row.ip)"
            >
              <el-icon><Position /></el-icon>
              Ping
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="scanStore.devices.length === 0" style="padding: 40px 0">
        <el-empty description="暂无设备数据">
          <el-button type="primary" @click="$router.push('/')">去扫描</el-button>
        </el-empty>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, DocumentCopy, Connection, Position } from '@element-plus/icons-vue'
import { useScanStore } from '@/stores/scan'

const router = useRouter()
const scanStore = useScanStore()

onMounted(() => {
  scanStore.refreshDevices()
})

function copyText(text: string) {
  navigator.clipboard.writeText(text)
  ElMessage.success(`已复制: ${text}`)
}

function goToSSH(ip: string) {
  router.push({ name: 'ssh', query: { host: ip } })
}

async function pingDevice(ip: string) {
  try {
    const res = await scanStore.ping(ip)
    if (res?.data?.online) {
      ElMessage.success(`${ip} 可达`)
    } else {
      ElMessage.warning(`${ip} 不可达`)
    }
  } catch {
    ElMessage.error('Ping 失败')
  }
}
</script>

<style scoped>
.ip-cell {
  font-family: 'Courier New', monospace;
  font-weight: 600;
}

code {
  font-family: 'Courier New', monospace;
  background: #f4f4f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.85rem;
}
</style>
