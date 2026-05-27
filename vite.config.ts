import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

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
              external: ['electron', 'electron-store', 'pdf-parse', 'mammoth', 'adm-zip']
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
            startup(['.', '--no-sandbox'], spawnOptions)
          }
        },
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
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron')
    }
  }
})
