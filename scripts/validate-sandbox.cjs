/**
 * Headless validation of the connector sandbox runtime.
 *
 * Runs under Electron (for `utilityProcess`/`process.parentPort`). Forks the
 * built sandbox (`dist-electron/connector-sandbox.js`), loads an inline probe
 * handler, and drives the full RPC roundtrip while acting as the host broker:
 *   init → ready, execute → result, host.log, host.http/context capability
 *   roundtrip, and the error path.
 *
 * Deterministic and network-free: the harness answers every capability itself.
 *
 * Usage: npx electron scripts/validate-sandbox.cjs
 */
const path = require('path')
const { app, utilityProcess } = require('electron')

const SANDBOX = path.join(__dirname, '..', 'dist-electron', 'connector-sandbox.js')

const PROBE_HANDLER = `
async function executeTool(name, args, host) {
  if (name === 'probe_echo') {
    host.log('info', 'echo', args.x)
    return { success: true, data: { echoed: args.x } }
  }
  if (name === 'probe_http') {
    const r = await host.http.fetch({ url: 'https://api.example.com/thing' })
    return { success: true, data: r.json }
  }
  if (name === 'probe_ctx') {
    const c = await host.context.get()
    return { success: true, data: c }
  }
  if (name === 'probe_throw') {
    throw new Error('boom')
  }
  return { success: false, error: 'unknown tool' }
}
module.exports = { executeTool }
`

const results = []
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function main() {
  await app.whenReady()

  const child = utilityProcess.fork(SANDBOX, [], { serviceName: 'connector-validate' })

  const pending = new Map()
  let callSeq = 0
  let logSeen = null
  let readyVersion = null

  child.on('message', message => {
    switch (message.type) {
      case 'ready':
        readyVersion = message.apiVersion
        break
      case 'log':
        logSeen = { level: message.level, args: message.args }
        break
      case 'capability': {
        // Act as the broker: answer each capability deterministically.
        let value
        if (message.method === 'http.fetch') {
          value = { ok: true, status: 200, headers: {}, text: '{"mocked":true}', json: { mocked: true } }
        } else if (message.method === 'context.get') {
          value = { projectKeys: ['ACME'] }
        } else {
          value = null
        }
        child.postMessage({ type: 'capabilityResult', capId: message.capId, ok: true, value })
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
      const timer = setTimeout(() => reject(new Error('sandbox never became ready')), 5000)
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
      const timer = setTimeout(() => reject(new Error(`timeout on ${name}`)), 5000)
      pending.set(callId, msg => {
        clearTimeout(timer)
        resolve(msg)
      })
      child.postMessage({ type: 'execute', callId, name, args })
    })

  child.postMessage({ type: 'init', source: PROBE_HANDLER, apiVersion: '1.0' })

  try {
    await waitReady()
    check('init → ready with apiVersion 1.0', readyVersion === '1.0', `got ${readyVersion}`)

    const echo = await execute('probe_echo', { x: 'hi' })
    check('execute returns tool result', echo.result && echo.result.success === true)
    check('result data echoed', echo.result && echo.result.data && echo.result.data.echoed === 'hi')
    check('host.log roundtrip', logSeen && logSeen.level === 'info' && logSeen.args[0] === 'echo')

    const http = await execute('probe_http', {})
    check(
      'host.http capability roundtrip',
      http.result && http.result.success === true && http.result.data && http.result.data.mocked === true,
    )

    const ctx = await execute('probe_ctx', {})
    check(
      'host.context capability roundtrip',
      ctx.result && ctx.result.data && Array.isArray(ctx.result.data.projectKeys) && ctx.result.data.projectKeys[0] === 'ACME',
    )

    const thrown = await execute('probe_throw', {})
    check('handler error surfaces as result.error', thrown.error && /boom/.test(thrown.error))
  } catch (error) {
    check('harness completed without exception', false, error instanceof Error ? error.message : String(error))
  }

  child.postMessage({ type: 'shutdown' })

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exitCode = failed.length === 0 ? 0 : 1
  setTimeout(() => app.quit(), 100)
}

main()
