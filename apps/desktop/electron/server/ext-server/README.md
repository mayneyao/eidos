# Extension Server Interceptor

This module implements request intercepting for Eidos extension domains.

## Environment Types

Eidos supports two distinct runtime environments for different extension types:

- **sandbox** - Runtime environment for **scripts** (pure JavaScript execution)
- **extensionId.ext** - Runtime environment for **blocks** (JSX component rendering)

This separation allows scripts to run in a lightweight JavaScript environment while blocks operate in a full React/JSX rendering context.

## Supported Domain Patterns

### 1. sandbox.<spaceId>.eidos.localhost/\*

This pattern is used for **script extensions** - providing both the sandbox environment and serving script files directly from the database. Scripts run in a pure JavaScript environment without JSX rendering capabilities.

**Sandbox HTML Format**: `sandbox.<spaceId>.eidos.localhost/`
**Script File Format**: `sandbox.<spaceId>.eidos.localhost/scriptid.js`

**Examples**:

- `sandbox.my-space.eidos.localhost/` - Returns the sandbox HTML environment
- `sandbox.my-space.eidos.localhost/my-script.js` - Returns the JavaScript code for script with ID "my-script" from space "my-space"
- `sandbox.25-w19.eidos.localhost/data-processor.js` - Returns the JavaScript code for script with ID "data-processor" from space "25-w19"

**Behavior**:

- Extracts the `spaceId` from the subdomain
- For `.js` requests: Extracts the `scriptId` from the pathname (removes leading `/` and trailing `.js`)
- Validates that the script ID doesn't contain `/` (no nested paths)
- Uses injected `getScriptCode` function to fetch script from database
- Returns the script's `code` field as JavaScript with appropriate headers
- Returns 404 if script not found
- Returns 400 if script ID is invalid
- Returns 500 if there's a database error

### 2. <extensionId>.block.<spaceId>.eidos.localhost/\*

This pattern is used for **block extensions** - providing full extension hosting with JSX component rendering capabilities. Blocks run in a React environment and can render UI components.

**Format**: `<extensionId>.block.<spaceId>.eidos.localhost/`

**Examples**:

- `myext.block.25-w19.eidos.localhost/` - Serves the full extension interface
- `myext.block.25-w19.eidos.localhost/app.js` - Returns the extension's compiled code

## Implementation Details

### ScriptSandboxHandler Integration

The script serving functionality is now integrated into the `ScriptSandboxHandler` class:

- Uses dependency injection pattern with `getScriptCode` function
- Maintains code isolation between sandbox and data access layers
- Supports both sandbox HTML serving and script file serving

### Headers

All JavaScript responses include these headers:

- `Content-Type: text/javascript`
- `Cross-Origin-Embedder-Policy: require-corp`

### Error Handling

- **400 Bad Request**: Invalid script ID (empty or contains `/`)
- **404 Not Found**: Script not found in database
- **500 Internal Server Error**: Database or other system errors, script code provider not configured

### Security Considerations

- Script IDs are validated to prevent path traversal attacks
- Only `.js` files are served from the sandbox domain for script requests
- Cross-origin policies are enforced
- Code access is abstracted through injected function

## Usage Examples

### Script Extensions (JavaScript Environment)

```javascript
// Fetch a script from the sandbox domain
fetch("http://sandbox.my-space.eidos.localhost:13127/my-script.js")
  .then((response) => response.text())
  .then((code) => {
    // Use the script code (pure JavaScript)
    console.log(code)
  })

// This is automatically handled by the SDK inject script
const module = await import(
  "http://sandbox.my-space.eidos.localhost:13127/my-script.js"
)
```

### Block Extensions (JSX Environment)

```javascript
// Block extensions are accessed through their extension domain
// and render JSX components in a React environment
// Example: http://my-block.block.my-space.eidos.localhost:13127/
```
