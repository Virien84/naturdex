import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relative paths, so the app works from any folder (e.g. GitHub Pages)
  base: './',
  // onnxruntime-web loads its .wasm files itself; Vite's pre-bundling would break that
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'NaturDex',
        short_name: 'NaturDex',
        description: 'Photograph nature and fill your NaturDex — fully offline.',
        lang: 'en',
        theme_color: '#2e7d32',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        // TODO: add 192x192 and 512x512 icons (required to install the app)
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        // The app shell (HTML, JS, CSS and onnxruntime's .wasm files) is cached on install.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm}'],
        // onnxruntime's .wasm file (~28 MB) is far bigger than Workbox's 2 MB default limit
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        // The model and the species list are NOT precached: they are downloaded in "Prepare trip"
        globIgnores: ['models/**', 'species/**'],
      },
    }),
  ],
})
