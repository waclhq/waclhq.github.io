import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from https://waclhq.github.io/ (org root site — base is /)

/** Every build is stamped; the Shell polls /version.json and offers a refresh
 *  when a newer build is live, so an installed home-screen copy never sits on
 *  a stale shell. */
const BUILD_ID = new Date().toISOString()
function versionStamp(): Plugin {
  return {
    name: 'wacl-version-stamp',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

export default defineConfig({
  base: '/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), tailwindcss(), versionStamp()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Recharts is big, but naming it as a manual chunk made Vite preload it
    // from index.html — on every cold load, for pages that never chart.
    // Automatic splitting leaves it with the lazy routes that import it.
    chunkSizeWarningLimit: 700,
  },
})
