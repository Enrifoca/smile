#!/usr/bin/env node
/**
 * Launcher for @smile/connector-sdk CLI (runs TypeScript via tsx from repo root).
 */
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.join(__dirname, '..', '..', '..')
const cli = path.join(__dirname, '..', 'src', 'cli.ts')
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

const result = spawnSync(
  process.execPath,
  [tsxCli, cli, ...process.argv.slice(2)],
  { cwd: repoRoot, stdio: 'inherit', env: process.env },
)

process.exit(result.status ?? 1)
