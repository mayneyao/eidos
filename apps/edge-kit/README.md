# Eidos Edge Kit

This is a Cloudflare Worker project using the [Hono](https://hono.dev/) framework. It provides common network helper services for the Eidos ecosystem.

## Features

- **Favicon Service**: Proxies and encodes website favicons to base64 to avoid CORS issues on the frontend.

## Structure

```
src/
├── index.ts        # Main entry point and global middleware
└── routes/
    └── favicon.ts  # Favicon fetching and base64 encoding route
```

## Development

```bash
# Install dependencies
pnpm install

# Run the local development server
pnpm dev
```

## Deployment

Deploy the worker to Cloudflare:

```bash
pnpm deploy
```

## Production URL

The production service is hosted at:
**`https://edge-kit.eidos.space`**

## API Reference

### `GET /favicon`

Fetches a website's favicon. By default, it proxies the raw image directly. It can optionally return a Base64 encoded data URL to completely bypass complex frontend image handling.

**Example Usage:**

```bash
# Get the raw favicon for google.com
curl -O https://edge-kit.eidos.space/favicon?domain=google.com&sz=64

# Get the Base64 JSON response
curl https://edge-kit.eidos.space/favicon?domain=google.com&base64=true
```

**Query Parameters:**

- `domain` (required): The domain name of the website (e.g., `google.com`)
- `sz` (optional): The size of the favicon. Defaults to `64`.
- `base64` (optional): Set to `true` to return the Base64 JSON response instead of the raw image.

**Response (Default - Raw Image):**

```http
HTTP/1.1 200 OK
Content-Type: image/png
Cache-Control: public, max-age=86400

<binary image data>
```

**Response (with `base64=true`):**

```json
{
  "url": "data:image/png;base64,..."
}
```
