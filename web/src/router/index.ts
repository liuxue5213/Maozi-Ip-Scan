import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'scan',
      component: () => import('@/views/ScanView.vue')
    },
    {
      path: '/devices',
      name: 'devices',
      component: () => import('@/views/DevicesView.vue')
    },
    {
      path: '/ssh',
      name: 'ssh',
      component: () => import('@/views/SSHView.vue')
    }
  ]
})

export default router
