import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const brandedElectron =
  process.platform === 'win32' ? path.join(rootDir, 'scripts', 'smile-electron.mjs') : undefined

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-store', 'pdf-parse', 'mammoth', 'adm-zip', 'better-sqlite3', 'ripgrep', 'jsdom', 'canvas', 'bufferutil', 'utf-8-validate', 'duck-duck-scrape', '@mozilla/readability']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart({ startup, reload }) {
          const env = { ...process.env }
          delete env.ELECTRON_RUN_AS_NODE
          const spawnOptions = { env }
          if (process.electronApp) {
            reload()
          } else {
            startup(['.', '--no-sandbox'], spawnOptions, brandedElectron)
          }
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      },
      {
        entry: 'electron/connector-sandbox.ts',
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
      '@electron': path.resolve(rootDir, './electron')
    }
  }
})
