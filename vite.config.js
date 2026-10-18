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
  // The docroot is PHP's public/ itself (fonts, traces, favicon are served from
  // there), and the bundle is written into public/dist inside it. Vite's public
  // dir copy is therefore both redundant and wrong here: it would mirror all of
  // public/ — including index.php — into the bundle. Disable it.
  publicDir: false,
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
    // publicDir is off (see above), so the dev server has no static files of
    // its own. Without these the map's plan image and the serif font came back
    // as index.html and the map drew a broken-image icon at full size.
    proxy: Object.fromEntries(
      ['/api', '/traces', '/fonts', '/favicon.svg'].map((path) => [path, { target: apiTarget, changeOrigin: true }])
    ),
  },
})
