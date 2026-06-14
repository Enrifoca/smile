async function executeTool(name, args, host) {
  if (name === 'fixture_search_records') {
    const query = String(args.query || '')
    const response = await host.http.request({
      method: 'GET',
      url: `https://api.example.com/search?q=${encodeURIComponent(query)}`,
    })
    if (!response.success) return response
    return { success: true, data: response.data }
  }

  if (name === 'fixture_create_record') {
    return {
      success: true,
      data: { id: 'new-id', title: String(args.title || '') },
    }
  }

  return { success: false, error: `Unknown tool: ${name}` }
}

async function approveAction(actionType, data) {
  if (actionType === 'fixture_create_record') {
    return { success: true, data: { id: 'approved-id', title: String(data.title || '') } }
  }
  return { success: false, error: `Unknown action: ${actionType}` }
}

module.exports = { executeTool, approveAction }
