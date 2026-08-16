<template>
  <div class="devices-view">
    <div class="card">
      <div class="card-title">
        🖥️ 设备列表
        <el-tag type="info" size="small" style="margin-left: 10px">
          共 {{ scanStore.deviceCount }} 台
        </el-tag>
        <el-dropdown style="float: right; margin-left: 8px" @command="handleExport">
          <el-button size="small">
            <el-icon><Download /></el-icon>
            导出<el-icon><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="csv">导出 CSV</el-dropdown-item>
              <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
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
        
        <el-table-column label="开放端口" min-width="160">
          <template #default="{ row }">
            <span v-if="!row.openPorts || row.openPorts.length === 0" style="color: #c0c4cc">-</span>
            <el-tag
              v-for="port in row.openPorts"
              :key="port"
              size="small"
              type="warning"
              effect="plain"
              style="margin: 0 2px; font-family: monospace"
            >
              {{ port }}
            </el-tag>
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
        
        <el-table-column label="备注" minwidth="160">
          <template #default="{ row }">
            <div v-if="row.noteName || row.note" class="note-cell">
              <el-tag v-if="row.noteName" size="small" :color="row.noteColor || '#409eff'" effect="dark" style="margin-right: 4px">
                {{ row.noteName }}
              </el-tag>
              <span class="note-text">{{ row.note }}</span>
            </div>
            <span v-else style="color: #c0c4cc; font-size: 0.8rem">点击编辑</span>
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
              @click="openNoteDialog(row)"
            >
              <el-icon><Edit /></el-icon>
              备注
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

  <!-- 备注编辑弹窗 -->
  <el-dialog v-model="noteDialogVisible" :title="`编辑备注 - ${currentNote.ip}`" width="420px">
    <el-form label-width="70px">
      <el-form-item label="标签名">
        <el-input v-model="currentNote.name" placeholder="如：测试服务器、打印机" maxlength="20" />
      </el-form-item>
      <el-form-item label="标签颜色">
        <div class="color-options">
          <div
            v-for="c in NOTE_COLORS"
            :key="c.value"
            class="color-dot"
            :class="{ active: currentNote.color === c.value }"
            :style="c.value ? { background: c.value } : { background: '#fff', border: '1px solid #dcdfe6' }"
            :title="c.label"
            @click="currentNote.color = c.value"
          />
        </div>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="currentNote.note" type="textarea" :rows="3" placeholder="备注内容..." />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="noteDialogVisible = false">取消</el-button>
      <el-button v-if="currentNote.name || currentNote.note" type="danger" plain @click="deleteNote">
        清除
      </el-button>
      <el-button type="primary" @click="saveNote">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, DocumentCopy, Connection, Position, Download, ArrowDown, Edit } from '@element-plus/icons-vue'
import { useScanStore } from '@/stores/scan'
import notesApi, { NOTE_COLORS, DeviceNote } from '@/api/notes'

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

// ---- 备注 ----
const noteDialogVisible = ref(false)
const currentNote = ref<DeviceNote>({ ip: '', name: '', note: '', color: '' })

function openNoteDialog(row: any) {
  currentNote.value = {
    ip: row.ip,
    name: row.noteName || '',
    note: row.note || '',
    color: row.noteColor || ''
  }
  noteDialogVisible.value = true
}

async function saveNote() {
  try {
    await notesApi.save(currentNote.value)
    noteDialogVisible.value = false
    await scanStore.refreshDevices()
  } catch {
    ElMessage.error('保存失败')
  }
}

async function deleteNote() {
  try {
    await notesApi.delete(currentNote.value.ip)
    noteDialogVisible.value = false
    await scanStore.refreshDevices()
  } catch {
    ElMessage.error('删除失败')
  }
}

function handleExport(format: string) {
  window.open(`/api/export/${format}`, '_blank')
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

.note-cell {
  display: flex;
  align-items: center;
}

.note-text {
  font-size: 0.8rem;
  color: #909399;
}

.color-options {
  display: flex;
  gap: 8px;
}

.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s;
}

.color-dot:hover {
  transform: scale(1.2);
}

.color-dot.active {
  box-shadow: 0 0 0 2px #409eff;
}
</style>
