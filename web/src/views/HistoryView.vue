<template>
  <div class="history-view">
    <!-- 设备变化对比 -->
    <div class="card" v-if="diff">
      <div class="card-title">📊 与上次扫描对比</div>
      <div class="diff-stats">
        <div class="diff-stat new">
          <span class="diff-num">{{ diff.newDevices.length }}</span>
          <span class="diff-label">🟢 新上线</span>
        </div>
        <div class="diff-stat gone">
          <span class="diff-num">{{ diff.goneDevices.length }}</span>
          <span class="diff-label">🔴 已离线</span>
        </div>
        <div class="diff-stat stable">
          <span class="diff-num">{{ diff.stableCount }}</span>
          <span class="diff-label">🟡 持续在线</span>
        </div>
      </div>

      <div v-if="diff.newDevices.length" class="diff-section">
        <div class="diff-section-title">新上线设备</div>
        <div class="device-grid">
          <div v-for="d in diff.newDevices" :key="'new-' + d.ip" class="device-card new-device">
            <div class="device-ip"><el-icon><CirclePlus /></el-icon> {{ d.ip }}</div>
            <div class="device-mac">{{ d.mac || 'N/A' }}</div>
            <div class="device-vendor" v-if="d.vendor !== 'Unknown'">🏷️ {{ d.vendor }}</div>
          </div>
        </div>
      </div>

      <div v-if="diff.goneDevices.length" class="diff-section">
        <div class="diff-section-title">已离线设备</div>
        <div class="device-grid">
          <div v-for="d in diff.goneDevices" :key="'gone-' + d.ip" class="device-card offline">
            <div class="device-ip"><el-icon><Remove /></el-icon> {{ d.ip }}</div>
            <div class="device-mac">{{ d.mac || 'N/A' }}</div>
            <div class="device-vendor" v-if="d.vendor !== 'Unknown'">🏷️ {{ d.vendor }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 历史时间线 -->
    <div class="card">
      <div class="card-title">
        📜 扫描历史
        <el-tag type="info" size="small" style="margin-left: 10px">
          共 {{ entries.length }} 次
        </el-tag>
      </div>

      <div v-if="entries.length === 0" class="empty-state">
        <el-empty description="还没有扫描历史" />
      </div>

      <el-timeline v-else>
        <el-timeline-item
          v-for="(entry, idx) in entries"
          :key="entry.id"
          :timestamp="formatTime(entry.time)"
          :type="idx === 0 ? 'primary' : 'info'"
          placement="top"
          size="large"
        >
          <div class="history-item">
            <div class="history-header">
              <el-tag size="small" type="success">{{ entry.deviceCount }} 台设备</el-tag>
              <span class="history-cidr">{{ entry.cidr }}</span>
              <span class="history-modes">{{ entry.modes.join(' + ') }}</span>
              <span class="history-duration">{{ entry.scanTimeMs }}ms</span>
            </div>
            <div class="history-devices" v-if="entry.devices.length">
              <el-tag
                v-for="d in entry.devices.slice(0, 8)"
                :key="d.ip"
                size="small"
                effect="plain"
                style="margin: 2px 2px 0 0; font-family: monospace"
                @click="goToSSH(d.ip)"
              >
                {{ d.ip }}
              </el-tag>
              <span v-if="entry.devices.length > 8" class="more-hint">
                还有 {{ entry.devices.length - 8 }} 台...
              </span>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { CirclePlus, Remove } from '@element-plus/icons-vue'
import historyApi, { HistoryEntry, HistoryDiff } from '@/api/history'

const router = useRouter()
const entries = ref<HistoryEntry[]>([])
const diff = ref<HistoryDiff | null>(null)

onMounted(async () => {
  await loadHistory()
  await loadDiff()
})

async function loadHistory() {
  try {
    const res = await historyApi.getAll()
    if (res.data?.success && res.data.data) {
      entries.value = res.data.data
    }
  } catch (e) {
    console.error('Load history failed:', e)
  }
}

async function loadDiff() {
  try {
    const res = await historyApi.compare()
    if (res.data?.success && res.data.data) {
      diff.value = res.data.data
    }
  } catch (e) {
    console.error('Load diff failed:', e)
  }
}

function formatTime(timeStr: string): string {
  if (!timeStr) return ''
  const d = new Date(timeStr)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function goToSSH(ip: string) {
  router.push({ name: 'ssh', query: { host: ip } })
}
</script>

<style scoped>
.diff-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
}

.diff-stat {
  flex: 1;
  text-align: center;
  padding: 12px;
  border-radius: 8px;
  background: #f4f4f5;
}

.diff-stat.new { background: #f0f9eb; }
.diff-stat.gone { background: #fef0f0; }
.diff-stat.stable { background: #fdf6ec; }

.diff-num {
  display: block;
  font-size: 2rem;
  font-weight: 700;
}

.diff-label {
  font-size: 0.85rem;
  color: #606266;
}

.diff-section {
  margin-top: 12px;
}

.diff-section-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #606266;
}

.history-item {
  padding: 4px 0;
}

.history-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.history-cidr {
  font-family: monospace;
  color: #606266;
  font-size: 0.9rem;
}

.history-modes {
  color: #909399;
  font-size: 0.8rem;
}

.history-duration {
  color: #c0c4cc;
  font-size: 0.8rem;
  margin-left: auto;
}

.history-devices {
  margin-top: 6px;
}

.history-devices .el-tag {
  cursor: pointer;
}

.more-hint {
  color: #c0c4cc;
  font-size: 0.8rem;
}

.new-device {
  border-left-color: #67c23a;
}
</style>
