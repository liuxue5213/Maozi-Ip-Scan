<template>
  <div class="ssh-view">
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
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection, CircleCheck, Close } from '@element-plus/icons-vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

const route = useRoute()
const terminalRef = ref<HTMLDivElement>()
const connected = ref(false)
const connecting = ref(false)

const sshConfig = reactive({
  host: '',
  port: 22,
  username: 'root',
  password: '',
  privateKey: ''
})

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let ws: WebSocket | null = null

onMounted(() => {
  // 从路由参数获取 host
  if (route.query.host) {
    sshConfig.host = route.query.host as string
  }
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
      selection: '#264f78',
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
}
</script>

<style scoped>
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
