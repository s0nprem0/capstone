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
    // Built into the docroot the PHP server is pointed at. Vite's default
    // project-root dist/ sits outside it, and the server answers any
    // extension-bearing request itself without reaching the front controller,
    // so a bundle over there 404s and the page renders blank. A symlink
    // bridging the two cannot be made in the image either: the compose bind
    // mount replaces /app, hiding anything the image put there.
    outDir: 'public/dist',
    emptyOutDir: true,
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
