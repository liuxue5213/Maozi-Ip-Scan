import { ref, watch, onMounted } from 'vue'

// 黑暗模式 composable
// 使用 Element Plus 官方暗色方案：给 <html> 加 class="dark"
const STORAGE_KEY = 'maozi-dark-mode'
const isDark = ref(false)

export function useDarkMode() {
  onMounted(() => {
    // 读取本地存储 or 跟随系统
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      isDark.value = stored === 'true'
    } else {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    applyClass()
  })

  watch(isDark, (val) => {
    localStorage.setItem(STORAGE_KEY, String(val))
    applyClass()
  })

  function applyClass() {
    const html = document.documentElement
    if (isDark.value) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }

  function toggle() {
    isDark.value = !isDark.value
  }

  return { isDark, toggle }
}
