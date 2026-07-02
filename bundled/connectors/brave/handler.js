// Brave Search connector handler (CommonJS). Runs in a constrained node:vm
// context inside a utilityProcess. Reach the outside world only through the
// injected `host` bridge.

async function executeTool(name, args, host) {
  if (name !== 'brave_web_search') {
    return { success: false, error: `Unknown tool: ${name}` }
  }

  const apiKey = await host.secrets.get('apiKey')
  if (!apiKey) {
    return { success: false, error: 'Brave Search API key not configured. Add it in Connectors settings.' }
  }

  const query = String(args.query || '').trim()
  if (!query) {
    return { success: false, error: 'query is required' }
  }

  const count = Math.min(Math.max(1, Number(args.count) || 5), 20)

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))
  url.searchParams.set('offset', '0')

  const response = await host.http.fetch({
    url: url.toString(),
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!response.ok) {
    const detail = typeof response.text === 'string' ? response.text : JSON.stringify(response.json ?? {})
    return { success: false, error: `Brave Search HTTP ${response.status}: ${detail || 'Unknown error'}` }
  }

  const body = response.json || {}
  const results = (body.web?.results ?? []).map((r) => ({
    title: String(r.title ?? 'Untitled'),
    url: String(r.url ?? ''),
    snippet: String(r.description ?? ''),
  })).filter((r) => r.url)

  return {
    success: true,
    data: {
      query,
      count: results.length,
      results,
    },
  }
}

module.exports = { executeTool }
