#!/usr/bin/env node
/**
 * Smoke-test a connector package in the Electron sandbox.
 *
 * Loads manifest.json + handler.js from the given directory, forks the built
 * sandbox (dist-electron/connector-sandbox.js), and executes one tool with a
 * deterministic mock host broker (network-free unless the handler calls MCP).
 *
 * Usage:
 *   electron packages/connector-sdk/scripts/test-connector.cjs <connector-dir>
 *     [--tool <name>] [--args '<json>']
 */
const fs = require('fs')
const path = require('path')
const { app, utilityProcess } = require('electron')

const REPO_ROOT = path.join(__dirname, '..', '..', '..')
const SANDBOX = path.join(REPO_ROOT, 'dist-electron', 'connector-sandbox.js')

function parseArgs(argv) {
  const positional = []
  let tool = null
  let argsJson = '{}'
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tool' && argv[i + 1]) {
      tool = argv[++i]
    } else if (argv[i] === '--args' && argv[i + 1]) {
      argsJson = argv[++i]
    } else if (!argv[i].startsWith('--')) {
      positional.push(argv[i])
    }
  }
  return { dir: positional[0], tool, argsJson }
}

function loadPackage(dir) {
  const manifestPath = path.join(dir, 'manifest.json')
  const handlerPath = path.join(dir, 'handler.js')
  if (!fs.existsSync(manifestPath)) throw new Error('manifest.json not found')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const handlerKind = manifest.handlerKind ?? 'code'
  if (handlerKind === 'mcp') {
    throw new Error('handlerKind "mcp" connectors are executed by the host directly; validate the manifest and test via the live app after MCP connection')
  }
  if (!fs.existsSync(handlerPath)) throw new Error('handler.js not found')
  return {
    manifest,
    handlerSource: fs.readFileSync(handlerPath, 'utf-8'),
  }
}

function pickTool(manifest, toolName) {
  if (toolName) {
    const found = manifest.tools.find(t => t.name === toolName)
    if (!found) throw new Error(`Tool not found in manifest: ${toolName}`)
    return found
  }
  const readTool = manifest.tools.find(t => t.category === 'connector-read')
  if (readTool) return readTool
  return manifest.tools[0]
}

const results = []
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function main() {
  const { dir, tool: toolFlag, argsJson } = parseArgs(process.argv.slice(2))
  if (!dir) {
    console.error('Usage: electron test-connector.cjs <connector-dir> [--tool name] [--args json]')
    process.exit(1)
  }

  if (!fs.existsSync(SANDBOX)) {
    console.error(`Sandbox not built: ${SANDBOX}\nRun npm run dev or build electron first.`)
    process.exit(1)
  }

  const connectorDir = path.resolve(dir)
  const { manifest, handlerSource } = loadPackage(connectorDir)
  const tool = pickTool(manifest, toolFlag)
  let toolArgs
  try {
    toolArgs = JSON.parse(argsJson)
  } catch (error) {
    console.error(`Invalid --args JSON: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  await app.whenReady()

  const child = utilityProcess.fork(SANDBOX, [], { serviceName: `connector-test-${manifest.id}` })
  const pending = new Map()
  let callSeq = 0
  let readyVersion = null
  const permissions = manifest.permissions || {}

  child.on('message', message => {
    switch (message.type) {
      case 'ready':
        readyVersion = message.apiVersion
        break
      case 'capability': {
        let value
        let ok = true
        let error
        try {
          if (message.method === 'http.fetch') {
            const url = message.params[0]?.url || ''
            const allowed = (permissions.http || []).some(prefix => url.startsWith(prefix))
            if (!allowed) throw new Error(`http not allowed: ${url}`)
            value = { ok: true, status: 200, headers: {}, text: '{"mocked":true}', json: { mocked: true } }
          } else if (message.method === 'mcp.call') {
            const [serverId] = message.params
            if (!(permissions.mcp || []).includes(serverId)) throw new Error(`mcp not allowed: ${serverId}`)
            value = { success: true, data: { mocked: true, serverId, tool: message.params[1] } }
          } else if (message.method === 'context.get') {
            value = { projectKeys: ['TEST'] }
          } else if (message.method === 'context.saveKnowledge') {
            value = undefined
          } else if (message.method === 'file.read') {
            if (!permissions.file?.read) throw new Error('file.read not permitted')
            value = { success: true, data: 'mock file contents' }
          } else if (message.method === 'secrets.get') {
            value = 'mock-secret'
          } else if (message.method === 'host.call') {
            const [capability] = message.params
            if (!(permissions.host || []).includes(capability)) throw new Error(`host not allowed: ${capability}`)
            value = { success: true, data: { mocked: true, capability } }
          } else if (message.method === 'cli.run') {
            const [request] = message.params
            const command = request?.command || ''
            const allowed = (permissions.cli || []).some(prefix => command === prefix || command.startsWith(`${prefix} `))
            if (!allowed) throw new Error(`cli not allowed: ${command}`)
            value = { success: true, exitCode: 0, stdout: '{"mocked":true}', stderr: '' }
          } else {
            throw new Error(`Unknown capability: ${message.method}`)
          }
        } catch (err) {
          ok = false
          error = err instanceof Error ? err.message : String(err)
        }
        child.postMessage({ type: 'capabilityResult', capId: message.capId, ok, value, error })
        break
      }
      case 'result': {
        const resolve = pending.get(message.callId)
        if (resolve) {
          pending.delete(message.callId)
          resolve(message)
        }
        break
      }
    }
  })

  const waitReady = () =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sandbox never became ready')), 8000)
      const poll = setInterval(() => {
        if (readyVersion) {
          clearInterval(poll)
          clearTimeout(timer)
          resolve()
        }
      }, 20)
    })

  const execute = (name, args) =>
    new Promise((resolve, reject) => {
      const callId = `c${++callSeq}`
      const timer = setTimeout(() => reject(new Error(`timeout on ${name}`)), 15000)
      pending.set(callId, msg => {
        clearTimeout(timer)
        resolve(msg)
      })
      child.postMessage({ type: 'execute', callId, name, args })
    })

  child.postMessage({ type: 'init', source: handlerSource, apiVersion: manifest.apiVersion })

  try {
    await waitReady()
    check('init → ready', readyVersion === manifest.apiVersion, `got ${readyVersion}`)

    console.log(`\nExecuting ${tool.name} with args ${JSON.stringify(toolArgs)}\n`)
    const outcome = await execute(tool.name, toolArgs)
    if (outcome.error) {
      check(`${tool.name} executes without handler throw`, false, outcome.error)
    } else {
      check(`${tool.name} returns a result`, !!outcome.result)
      check(`${tool.name} success flag`, outcome.result?.success === true, JSON.stringify(outcome.result?.error || outcome.result?.data)?.slice(0, 120))
    }
  } catch (error) {
    check('harness completed', false, error instanceof Error ? error.message : String(error))
  }

  child.postMessage({ type: 'shutdown' })

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exitCode = failed.length === 0 ? 0 : 1
  setTimeout(() => app.quit(), 100)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
