<template>
  <div class="app">
    <header class="app-header">
      <div class="logo">
        <span class="logo-icon">🐱</span>
        <h1>Maozi-Ip-Scan</h1>
      </div>
      <p class="subtitle">局域网设备扫描工具</p>
    </header>

    <nav class="app-nav">
      <router-link to="/" class="nav-link">
        <el-icon><Search /></el-icon><span>扫描</span>
      </router-link>
      <router-link to="/devices" class="nav-link">
        <el-icon><Monitor /></el-icon><span>设备</span>
      </router-link>
      <router-link to="/history" class="nav-link">
        <el-icon><Clock /></el-icon><span>历史</span>
      </router-link>
      <router-link to="/ssh" class="nav-link">
        <el-icon><Connection /></el-icon><span>SSH</span>
      </router-link>
    </nav>

    <main class="app-main">
      <router-view />
    </main>

    <footer class="app-footer">
      <p>Maozi-Ip-Scan v1.0 · Built with Go + Vue3</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { Search, Monitor, Clock, Connection } from '@element-plus/icons-vue'
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 30px;
  text-align: center;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.logo-icon {
  font-size: 2.5rem;
}

.logo h1 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 600;
}

.subtitle {
  margin: 5px 0 0;
  opacity: 0.85;
  font-size: 0.95rem;
}

.app-main {
  flex: 1;
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.app-nav {
  display: flex;
  justify-content: center;
  gap: 4px;
  background: white;
  border-bottom: 1px solid #ebeef5;
  padding: 0 16px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 18px;
  color: #606266;
  text-decoration: none;
  font-size: 0.95rem;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.nav-link:hover {
  color: #409eff;
}

.nav-link.router-link-active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.app-footer {
  text-align: center;
  padding: 15px;
  color: #909399;
  font-size: 0.85rem;
  border-top: 1px solid #ebeef5;
  background: white;
}
</style>
