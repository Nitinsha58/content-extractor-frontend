import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// pdfjs dynamically `import()`s JS fallback files from /pdfjs-wasm/.
// Vite blocks module imports of files in /public, so we intercept those
// requests with a middleware that runs before Vite's module transformer.
const pdfjsPublicAssets = {
  name: 'pdfjs-public-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url?.split('?')[0] ?? ''
      if (!url.startsWith('/pdfjs-')) return next()
      const filePath = path.join(process.cwd(), 'public', url)
      if (!fs.existsSync(filePath)) return next()
      const ext = path.extname(filePath)
      const contentType =
        ext === '.js' || ext === '.mjs' ? 'text/javascript; charset=utf-8'
        : ext === '.wasm' ? 'application/wasm'
        : 'application/octet-stream'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'no-cache')
      res.end(fs.readFileSync(filePath))
    })
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsPublicAssets],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})
