#!/usr/bin/env node
/**
 * smile-connector CLI — validate and smoke-test connector packages.
 */
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

import { runContractChecks } from '../../../src/connectors/contract/contractChecks'
import { validateConnectorPackage } from './validatePackage'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..', '..', '..')

function printUsage() {
  console.log(`smile-connector — smile:D connector SDK CLI

Usage:
  smile-connector validate <connector-dir>
  smile-connector check-contract
  smile-connector test <connector-dir> [--tool <name>] [--args '<json>']

Examples:
  smile-connector validate packages/connector-sdk/fixtures/minimal
  smile-connector test packages/connector-sdk/fixtures/minimal --tool fixture_search_records --args '{"query":"hello"}'
`)
}

function cmdValidate(dir: string): number {
  const result = validateConnectorPackage(dir)
  for (const warning of result.warnings) {
    console.warn(`WARN  ${warning}`)
  }
  if (result.ok) {
    console.log(`OK  ${result.id} — manifest valid`)
    return 0
  }
  for (const error of result.errors) {
    console.error(`ERR   ${error}`)
  }
  return 1
}

function cmdCheckContract(): number {
  const result = runContractChecks()
  if (result.passed) {
    console.log('OK  contract checks passed')
    return 0
  }
  for (const failure of result.failures) {
    console.error(`ERR   ${failure}`)
  }
  return 1
}

function cmdTest(args: string[]): number {
  const dir = args[0]
  if (!dir) {
    console.error('ERR   test requires a connector directory')
    return 1
  }

  const script = path.join(__dirname, '..', 'scripts', 'test-connector.cjs')
  const electronCli = path.join(REPO_ROOT, 'node_modules', 'electron', 'cli.js')
  const forward = [electronCli, script, path.resolve(dir), ...args.slice(1)]

  const result = spawnSync(process.execPath, forward, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) {
    console.error(`ERR   ${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

function main() {
  const [, , command, ...rest] = process.argv
  switch (command) {
    case 'validate':
      if (!rest[0]) {
        printUsage()
        process.exit(1)
      }
      process.exit(cmdValidate(rest[0]))
    case 'check-contract':
      process.exit(cmdCheckContract())
    case 'test':
      process.exit(cmdTest(rest))
    default:
      printUsage()
      process.exit(command ? 1 : 0)
  }
}

main()
