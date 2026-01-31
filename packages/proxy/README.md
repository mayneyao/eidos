# @eidos.space/proxy

HTTP Proxy service for Eidos with subdomain-based cross-origin request proxying.

## Features

- **Subdomain Pattern**: `api.example.com.proxy.eidos.localhost/path` → `https://api.example.com/path`
- **Hono Middleware**: Easy integration with Hono framework
- **CORS Support**: Built-in CORS headers for cross-origin requests
- **Security Filtering**: Blocks localhost, private IPs, and internal domains
- **TypeScript**: Full TypeScript support

## Installation

```bash
pnpm add @eidos.space/proxy
```

## Usage

### As Hono Middleware (Recommended)

```typescript
import { Hono } from 'hono';
import { createProxyMiddleware } from '@eidos.space/proxy';

const app = new Hono();

// Enable proxy for *.proxy.eidos.localhost
app.use('*', createProxyMiddleware({ 
  baseDomain: 'eidos.localhost',
  requireHttps: true // default
}));
```

### Using ProxyHandler Directly

```typescript
import { ProxyHandler } from '@eidos.space/proxy';

const handler = new ProxyHandler();
const response = await handler.handleProxyRequest(
  'api.openai.com', 
  new URL('http://api.openai.com.proxy.eidos.localhost/v1/chat'),
  context
);
```

## Configuration

```typescript
interface ProxyMiddlewareConfig {
  /** Base domain for proxy subdomains (e.g., 'eidos.localhost') */
  baseDomain: string;
  /** Custom logger */
  logger?: ProxyLogger;
  /** Whether to require HTTPS for target URLs (default: true) */
  requireHttps?: boolean;
}
```

## Security Features

- **Protocol Filtering**: Only HTTPS allowed by default
- **Localhost Blocking**: Prevents access to localhost and 127.0.0.1
- **Private IP Blocking**: Blocks private IP ranges
- **Internal Domain Blocking**: Prevents access to .localhost domains

## License

ISC
