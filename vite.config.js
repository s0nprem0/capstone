import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.DOCKER
  ? 'http://php:8000'
  : process.env.XAMPP
    ? 'http://localhost:80'
    : 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    manifest: true,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
