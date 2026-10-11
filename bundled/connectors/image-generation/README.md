# Image Generation connector

Generate images from text prompts using hosted image models.

## Supported providers

| Provider | API key source |
| --- | --- |
| OpenAI | [OpenAI API keys](https://platform.openai.com/api-keys) |
| Replicate | [Replicate tokens](https://replicate.com/account/api-tokens) |
| Qwen / QwenCloud | [QwenCloud API keys](https://www.qwencloud.com) |

## Configuration

1. Install the connector from **Connectors → Catalog**.
2. Open the connector settings.
3. Select a **Provider** from the dropdown.
4. Paste your **API key**.
5. The settings page fetches the available image models from the provider and shows them in the **Model** dropdown.
6. Select a **Model** and save.

Models are fetched live from the provider every time you change provider or API key. You can also click **Refresh models** to reload the list.

## Provider-specific notes

### Qwen / QwenCloud

This connector uses the QwenCloud image generation API:

```
POST https://maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation
```

The API key format is `sk-...`. Make sure your QwenCloud account has access to the chosen image model.
