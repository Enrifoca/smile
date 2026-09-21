## Image Generation connector

Use this connector when the user asks for generated images, illustrations, or diagrams and no native image-generation model is configured.

### Configuration

Set **Provider** to one of:

- `openai` — OpenAI DALL-E 3. Requires an OpenAI API key with image generation access.
- `replicate` — Replicate-hosted FLUX Schnell. Requires a Replicate API token.

Paste the corresponding API key in **Connectors → Image Generation**.

### Tool

- `image_generation_generate` — generate an image from a text prompt. Returns either a base64-encoded PNG (OpenAI) or a public image URL (Replicate).

### Provider-specific notes

- OpenAI DALL-E 3 supports sizes: `1024x1024`, `1792x1024`, `1024x1792`. Styles: `vivid`, `natural`.
- Replicate FLUX Schnell supports arbitrary `WIDTHxHEIGHT` sizes but may crop or letterbox to the model's latent resolution.

### Errors

- If the API returns 401, tell the user to check the API key in **Connectors → Image Generation**.
- If the provider is unsupported, list the supported providers.
