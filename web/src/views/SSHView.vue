<template>
  <div class="ssh-view">
    <!-- 已保存的连接 -->
    <div class="card">
      <div class="card-title">
        📌 已保存的连接
        <el-button size="small" style="float: right" @click="loadConnections">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>

      <div v-if="savedConnections.length === 0" class="empty-state">
        <el-empty description="还没有保存的连接，填写下方表单后点击「保存连接」" />
      </div>

      <div v-else class="conn-list">
        <div
          v-for="conn in savedConnections"
          :key="conn.id"
          class="conn-card"
          @click="useConnection(conn)"
        >
          <div class="conn-info">
            <span class="conn-name">{{ conn.note || conn.username + '@' + conn.host }}</span>
            <span class="conn-addr">{{ conn.username }}@{{ conn.host }}:{{ conn.port }}</span>
          </div>
          <div class="conn-actions" @click.stop>
            <el-button link size="small" type="primary" @click="useConnection(conn)">
              <el-icon><Connection /></el-icon>
              连接
            </el-button>
            <el-button link size="small" type="danger" @click="deleteConnection(conn.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- SSH 终端 / 配置 -->
    <div class="card">
      <div class="card-title">🔐 SSH 终端</div>

      <!-- 连接配置 -->
      <div v-if="!connected" class="ssh-config">
        <el-form :model="sshConfig" label-width="100px">
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="主机地址">
                <el-input v-model="sshConfig.host" placeholder="IP 或域名" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="端口">
                <el-input-number v-model="sshConfig.port" :min="1" :max="65535" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="用户名">
                <el-input v-model="sshConfig.username" placeholder="root" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="密码">
                <el-input
                  v-model="sshConfig.password"
                  type="password"
                  show-password
                  placeholder="输入密码"
                />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="备注">
                <el-input v-model="sshConfig.note" placeholder="可选：便于识别的名称" />
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="私钥">
                <el-input
                  v-model="sshConfig.privateKey"
                  type="textarea"
                  :rows="3"
                  placeholder="可选：SSH 私钥内容"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item>
            <el-button type="primary" @click="connect" :loading="connecting">
              <el-icon><Connection /></el-icon>
              连接
            </el-button>
            <el-button @click="saveConnection" :disabled="!sshConfig.host">
              <el-icon><Star /></el-icon>
              保存连接
            </el-button>
            <el-button @click="reset">重置</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 已连接状态 -->
      <div v-else>
        <div class="ssh-toolbar">
          <el-tag type="success">
            <el-icon><CircleCheck /></el-icon>
            已连接: {{ sshConfig.username }}@{{ sshConfig.host }}:{{ sshConfig.port }}
          </el-tag>
          <el-button type="danger" size="small" @click="disconnect">
            <el-icon><Close /></el-icon>
            断开连接
          </el-button>
        </div>

        <!-- 终端 -->
        <div ref="terminalRef" class="terminal-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection, CircleCheck, Close, Refresh, Star, Delete } from '@element-plus/icons-vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import axios from 'axios'

const route = useRoute()
const terminalRef = ref<HTMLDivElement>()
const connected = ref(false)
const connecting = ref(false)

const sshConfig = reactive({
  host: '',
  port: 22,
  username: 'root',
  password: '',
  privateKey: '',
  note: ''
})

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let ws: WebSocket | null = null

onMounted(() => {
  // 从路由参数获取 host
  if (route.query.host) {
    sshConfig.host = route.query.host as string
  }
  // 加载已保存的连接
  loadConnections()
})

onUnmounted(() => {
  disconnect()
})

function connect() {
  if (!sshConfig.host || !sshConfig.username) {
    ElMessage.warning('请填写主机地址和用户名')
    return
  }

  if (!sshConfig.password && !sshConfig.privateKey) {
    ElMessage.warning('请输入密码或私钥')
    return
  }

  connecting.value = true

  // 初始化终端
  initTerminal()

  // 构建 WebSocket URL
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({
    host: sshConfig.host,
    port: String(sshConfig.port),
    username: sshConfig.username,
    password: sshConfig.password,
    cols: String(term?.cols || 80),
    rows: String(term?.rows || 24)
  })

  ws = new WebSocket(`${protocol}//${location.host}/api/ssh?${params}`)

  ws.onopen = () => {
    connected.value = true
    connecting.value = false
    ElMessage.success('SSH 连接成功')
    term?.focus()
  }

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      term?.write(event.data)
    }
  }

  ws.onerror = () => {
    connecting.value = false
    ElMessage.error('SSH 连接失败')
  }

  ws.onclose = () => {
    connected.value = false
    connecting.value = false
    term?.write('\r\n\x1b[31m[连接已断开]\x1b[0m\r\n')
  }
}

function disconnect() {
  if (ws) {
    ws.close()
    ws = null
  }
  connected.value = false
}

function initTerminal() {
  if (term) return

  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      selectionBackground: '#264f78',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5'
    },
    scrollback: 1000
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  if (terminalRef.value) {
    term.open(terminalRef.value)
    fitAddon.fit()
  }

  // 输入处理
  term.onData((data) => {
    ws?.send(data)
  })

  // 窗口大小变化
  window.addEventListener('resize', handleResize)
}

function handleResize() {
  if (fitAddon && term && ws?.readyState === WebSocket.OPEN) {
    fitAddon.fit()
    const { cols, rows } = term
    ws.send(JSON.stringify({ type: 'resize', cols, rows }))
  }
}

function reset() {
  sshConfig.host = ''
  sshConfig.port = 22
  sshConfig.username = 'root'
  sshConfig.password = ''
  sshConfig.privateKey = ''
  sshConfig.note = ''
}

// ---- 连接管理 ----
interface SavedConn {
  id: string
  host: string
  port: number
  username: string
  note: string
  hasPass: boolean
  lastUsed?: number
}

const savedConnections = ref<SavedConn[]>([])

async function loadConnections() {
  try {
    const res = await axios.get('/api/connections')
    if (res.data?.success && res.data.data) {
      savedConnections.value = res.data.data
    }
  } catch {
    // ignore
  }
}

// 加载加密后的完整凭据（含密码）
async function loadDecryptedConn(id: string): Promise<(SavedConn & { password: string; privateKey: string }) | null> {
  try {
    const res = await axios.get(`/api/connections/${id}`)
    if (res.data?.success && res.data.data) {
      return res.data.data
    }
  } catch {
    // ignore
  }
  return null
}

function useConnection(conn: SavedConn) {
  sshConfig.host = conn.host
  sshConfig.port = conn.port
  sshConfig.username = conn.username
  sshConfig.note = conn.note || ''
  sshConfig.password = ''
  sshConfig.privateKey = ''

  // 如果有保存的密码，尝试加载
  if (conn.hasPass) {
    loadDecryptedConn(conn.id).then((dec) => {
      if (dec) {
        sshConfig.password = dec.password || ''
        sshConfig.privateKey = dec.privateKey || ''
      }
    })
  }

  ElMessage.success(`已填充 ${conn.host} 的连接信息`)
}

async function saveConnection() {
  try {
    await axios.post('/api/connections', {
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
      password: sshConfig.password,
      privateKey: sshConfig.privateKey,
      note: sshConfig.note
    })
    ElMessage.success('连接已保存')
    await loadConnections()
  } catch {
    ElMessage.error('保存失败')
  }
}

async function deleteConnection(id: string) {
  try {
    await axios.delete(`/api/connections/${id}`)
    ElMessage.success('已删除')
    await loadConnections()
  } catch {
    ElMessage.error('删除失败')
  }
}

</script>

<style scoped>
.conn-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.conn-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  border: 1px solid #ebeef5;
}

.conn-card:hover {
  background: #ecf5ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.conn-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.conn-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-addr {
  font-family: monospace;
  font-size: 0.8rem;
  color: #909399;
}

.conn-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.ssh-config {
  max-width: 700px;
}

.ssh-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.terminal-container {
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
  height: 500px;
  padding: 4px;
}
</style>
