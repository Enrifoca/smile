async function executeTool(name, args, host) {
  switch (name) {
    case 'image_generation_generate': {
      const provider = await host.secrets.get('provider')
      const apiKey = await host.secrets.get('apiKey')

      if (!provider) return { success: false, error: 'Provider not configured. Set it in Connectors → Image Generation.' }
      if (!apiKey) return { success: false, error: 'API key not configured. Set it in Connectors → Image Generation.' }

      const prompt = String(args.prompt || '')
      if (!prompt) return { success: false, error: 'Prompt is required.' }

      const size = args.size ? String(args.size) : undefined
      const style = args.style ? String(args.style) : undefined

      if (provider === 'openai') {
        const body = {
          model: 'dall-e-3',
          prompt,
          response_format: 'b64_json',
          n: 1,
        }
        if (size) body.size = size
        if (style) body.style = style

        const res = await host.http.fetch({
          url: 'https://api.openai.com/v1/images/generations',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          let message = `OpenAI image API error: ${res.status}`
          try {
            const err = JSON.parse(res.text || '{}')
            message = err.error?.message || message
          } catch { /* ignore */ }
          return { success: false, error: message }
        }

        const data = JSON.parse(res.text || '{}')
        const image = data.data?.[0]
        if (!image) return { success: false, error: 'No image returned from OpenAI.' }
        return { success: true, data: { base64: image.b64_json, url: image.url } }
      }

      if (provider === 'replicate') {
        const body = {
          version: 'black-forest-labs/flux-schnell',
          input: { prompt },
        }
        if (size) {
          const [width, height] = size.split('x').map(s => parseInt(s, 10))
          if (width && height) {
            body.input.width = width
            body.input.height = height
          }
        }

        const predictionRes = await host.http.fetch({
          url: 'https://api.replicate.com/v1/predictions',
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait',
          },
          body: JSON.stringify(body),
        })

        if (!predictionRes.ok) {
          let message = `Replicate API error: ${predictionRes.status}`
          try {
            const err = JSON.parse(predictionRes.text || '{}')
            message = err.detail || err.error || message
          } catch { /* ignore */ }
          return { success: false, error: message }
        }

        const prediction = JSON.parse(predictionRes.text || '{}')
        const output = prediction.output
        if (!output) return { success: false, error: 'No output returned from Replicate.' }

        // FLUX models may return a single URL or an array of URLs.
        const url = Array.isArray(output) ? output[0] : output
        return { success: true, data: { url } }
      }

      return { success: false, error: `Unsupported provider: ${provider}. Supported: openai, replicate.` }
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

module.exports = { executeTool }
