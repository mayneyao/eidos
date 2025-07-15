# Eidos Sandbox Package

This package provides secure sandbox environments and proxy services for the Eidos application.

## Components

### ScriptSandboxHandler

Handles script execution in isolated sandbox environments using webview containers.

- **Domain Pattern**: `sandbox.<spaceId>.eidos.localhost`
- **Purpose**: Secure script execution with SDK injection
- **Features**: Space-level isolation, SDK access, secure environment, automatic fetch proxy

### ProxyHandler

Provides a secure proxy service for cross-origin requests with built-in security filtering.

- **Domain Pattern**: `proxy.eidos.localhost`
- **Purpose**: Handle cross-origin requests securely
- **Features**: URL validation, CORS support, security filtering

## Automatic Fetch Proxy

The SDK inject script automatically replaces `window.fetch` to route cross-origin requests through the proxy handler. This provides seamless cross-origin request handling without manual proxy URL construction.

### How It Works

```javascript
// In Eidos extensions, this automatically uses the proxy for cross-origin requests:
const response = await fetch('https://api.example.com/data');
const data = await response.json();

// Same-origin requests use the original fetch:
const localResponse = await fetch('/local/api');
```

### Automatic Routing Logic

- **Cross-origin requests** → Automatically routed through `proxy.eidos.localhost`
- **Same-origin requests** → Use original `fetch` function
- **Proxy requests** → Use original `fetch` to avoid double-proxying

## ProxyHandler Usage

### Manual Proxy Request (if needed)

```javascript
// Manual proxy usage (not needed with fetch replacement)
const response = await fetch('http://proxy.eidos.localhost:13127/?url=https://api.example.com/data');
const data = await response.json();
```

### With Custom Headers

```javascript
// Proxy a POST request with custom headers
const response = await fetch('http://proxy.eidos.localhost:13127/?url=https://api.example.com/submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ key: 'value' })
});
```

### Status Check

```javascript
// Check proxy service status
const status = await fetch('http://proxy.eidos.localhost:13127/status');
const statusData = await status.json();
console.log(statusData);
```

## Security Features

### URL Validation

The proxy handler includes several security measures:

- **Protocol Filtering**: Only HTTP and HTTPS are allowed
- **Localhost Blocking**: Prevents access to localhost and 127.0.0.1
- **Private IP Blocking**: Blocks private IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- **Internal Domain Blocking**: Prevents access to .localhost, .local, and eidos.localhost domains

### CORS Support

- Automatic CORS headers for cross-origin requests
- OPTIONS preflight request handling
- Configurable access control policies

### Header Management

- Strips sensitive headers (Authorization, Cookie)
- Adds security headers (X-Forwarded-For, X-Forwarded-Host)
- Preserves necessary request headers (User-Agent, Accept, etc.)

## Integration

The handlers are integrated into the Eidos server at multiple levels:

1. **Main Server Integration** (`apps/desktop/electron/server/server.ts`):
   - ProxyHandler is directly integrated into the main server
   - Handles `proxy.eidos.localhost` requests before other middleware

2. **Extension Server Integration** (`apps/desktop/electron/server/ext-server/index.ts`):
   - ScriptSandboxHandler for sandbox environments
   - Extension-specific request handling

### Domain Routing

1. `proxy.eidos.localhost` → ProxyHandler (Main Server)
2. `sandbox.<spaceId>.eidos.localhost` → ScriptSandboxHandler (Extension Server)
3. `<extensionId>.block.<spaceId>.eidos.localhost` → Extension Handler (Extension Server)

## Error Handling

Both handlers include comprehensive error handling:

- Invalid URL parameters return 400 Bad Request
- Security violations return 400 Bad Request  
- Network errors return 500 Internal Server Error
- All errors are logged for debugging

## Development

### Testing the Proxy

```bash
# Test basic proxy functionality
curl "http://proxy.eidos.localhost:13127/?url=https://httpbin.org/json"

# Test status endpoint
curl "http://proxy.eidos.localhost:13127/status"

# Test CORS preflight
curl -X OPTIONS "http://proxy.eidos.localhost:13127/?url=https://httpbin.org/json" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type"
```

### Adding New Security Rules

To add new URL validation rules, modify the `isValidTargetUrl` method in `ProxyHandler`:

```typescript
private isValidTargetUrl(targetUrl: string): boolean {
  // Add custom validation logic here
  return true;
}
```
