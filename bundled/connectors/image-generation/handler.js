async function executeTool(name, args, host) {
  switch (name) {
    case 'image_generation_list_models': {
      const provider = String(args.provider || '')
      const apiKey = String(args.apiKey || '')

      if (!provider) return { success: false, error: 'Provider is required.' }
      if (!apiKey) return { success: false, error: 'API key is required.' }

      if (provider === 'openai') {
        const res = await host.http.fetch({
          url: 'https://api.openai.com/v1/models',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        })
        if (!res.ok) {
          let message = `OpenAI API error: ${res.status}`
          try {
            const err = JSON.parse(res.text || '{}')
            message = err.error?.message || message
          } catch { /* ignore */ }
          return { success: false, error: message }
        }
        const data = JSON.parse(res.text || '{}')
        const models = (data.data || [])
          .filter(model => /dall-e|gpt-image/i.test(model.id))
          .map(model => ({ id: model.id, name: model.id }))
        return { success: true, data: { models } }
      }

      if (provider === 'replicate') {
        const res = await host.http.fetch({
          url: 'https://api.replicate.com/v1/models',
          method: 'GET',
          headers: {
            'Authorization': `Token ${apiKey}`,
          },
        })
        if (!res.ok) {
          let message = `Replicate API error: ${res.status}`
          try {
            const err = JSON.parse(res.text || '{}')
            message = err.detail || err.error || message
          } catch { /* ignore */ }
          return { success: false, error: message }
        }
        const data = JSON.parse(res.text || '{}')
        const models = (data.results || [])
          .filter(model => {
            const text = `${model.name || ''} ${model.description || ''} ${model.owner || ''}`.toLowerCase()
            return /flux|sdxl|image|imagen|photo|picture|generate/.test(text)
          })
          .slice(0, 50)
          .map(model => ({ id: `${model.owner}/${model.name}`, name: `${model.owner}/${model.name}` }))
        return { success: true, data: { models } }
      }

      if (provider === 'qwen') {
        const fallbackModels = [
          { id: 'qwen-image-3.0', name: 'Qwen Image 3.0' },
          { id: 'qwen-image-3.0-pro', name: 'Qwen Image 3.0 Pro' },
          { id: 'qwen-image-2.0', name: 'Qwen Image 2.0' },
          { id: 'qwen-image', name: 'Qwen Image' },
          { id: 'qwen-image-plus', name: 'Qwen Image Plus' },
          { id: 'qwen-image-max', name: 'Qwen Image Max' },
        ]

        const res = await host.http.fetch({
          url: 'https://maas.qwencloudapi.com/compatible-mode/v1/models',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        })
        if (!res.ok) {
          return { success: true, data: { models: fallbackModels } }
        }
        const data = JSON.parse(res.text || '{}')
        const models = (data.data || [])
          .filter(model => /image|wanx|wan-|qwen-image/i.test(model.id))
          .map(model => ({ id: model.id, name: model.id }))
        if (models.length === 0) {
          return { success: true, data: { models: fallbackModels } }
        }
        return { success: true, data: { models } }
      }

      return { success: false, error: `Unsupported provider: ${provider}.` }
    }

    case 'image_generation_generate': {
      const provider = await host.secrets.get('provider')
      const model = await host.secrets.get('model')
      const apiKey = await host.secrets.get('apiKey')

      if (!provider) return { success: false, error: 'Provider not configured. Set it in Connectors → Image Generation.' }
      if (!model) return { success: false, error: 'Model not configured. Set it in Connectors → Image Generation.' }
      if (!apiKey) return { success: false, error: 'API key not configured. Set it in Connectors → Image Generation.' }

      const prompt = String(args.prompt || '')
      if (!prompt) return { success: false, error: 'Prompt is required.' }

      const size = args.size ? String(args.size) : undefined
      const style = args.style ? String(args.style) : undefined

      if (provider === 'openai') {
        const body = {
          model: model || 'dall-e-3',
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
          version: model || 'black-forest-labs/flux-schnell',
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

      if (provider === 'qwen') {
        const body = {
          model: model || 'qwen-image-3.0-pro',
          input: {
            messages: [
              {
                role: 'user',
                content: [{ text: prompt }],
              },
            ],
          },
          parameters: {
            prompt_extend: true,
          },
        }

        // Qwen image models accept size shorthand (e.g. "1024*1024") or "1K"/"2K".
        if (size) {
          const normalizedSize = size.toLowerCase().replace('x', '*')
          body.parameters.size = normalizedSize
        }

        const res = await host.http.fetch({
          url: 'https://maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          let message = `QwenCloud image API error: ${res.status}`
          try {
            const err = JSON.parse(res.text || '{}')
            message = err.message || err.error?.message || message
          } catch { /* ignore */ }
          return { success: false, error: message }
        }

        const data = JSON.parse(res.text || '{}')
        const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image
        if (!imageUrl) return { success: false, error: 'No image returned from Qwen.' }
        return { success: true, data: { url: imageUrl } }
      }

      return { success: false, error: `Unsupported provider: ${provider}. Supported: openai, replicate, qwen.` }
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

module.exports = { executeTool }
