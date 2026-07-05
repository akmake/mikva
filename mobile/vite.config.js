import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' → relative asset paths so the built bundle loads from Capacitor's
// file:// WebView. dev server (browser) proxies /api to the local backend.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3100,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
