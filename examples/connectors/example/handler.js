// Sandboxed connector handler (CommonJS). Runs in a constrained node:vm context
// inside a utilityProcess. No require/process/fetch/fs — reach the outside world
// only through the injected `host` bridge.

async function executeTool(name, args, host) {
  switch (name) {
    case 'example_get_post': {
      const response = await host.http.fetch({
        url: `https://jsonplaceholder.typicode.com/posts/${args.id}`,
      })
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` }
      return { success: true, data: response.json }
    }
    case 'example_echo': {
      host.log('info', 'echo', args.message)
      return { success: true, data: { echoed: args.message } }
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

module.exports = { executeTool }
