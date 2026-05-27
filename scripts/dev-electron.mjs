#!/usr/bin/env node
/**
 * Start Vite + Electron dev without ELECTRON_RUN_AS_NODE.
 * Cursor and other Electron-based IDEs set that variable, which makes
 * require('electron') return a path string and breaks the main process.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [viteBin], {
  stdio: 'inherit',
  env,
  cwd: root,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
