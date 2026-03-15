# @eidos.space/client

Eidos RPC client for Node.js and browser environments. Connect to a headless Eidos server via HTTP and interact with your data using a Prisma-style API.

## Installation

```bash
npm install @eidos.space/client @eidos.space/core
```

## Basic Usage

```typescript
import { createEidosClient } from "@eidos.space/client"

const client = createEidosClient({
  endpoint: "http://localhost:3000/rpc",
  apiKey: "your-api-key", // Optional: if server requires authentication
})

// Query table data
const posts = await client.currentSpace.table("posts").findMany({
  where: { published: true },
  take: 10,
})

// Get graft sync status
const status = await client.currentSpace.graft.status()
```

## Integration with React

To use the client in a React application, we recommend using `@eidos.space/react` which provides hooks and state management for the Eidos SDK.

### 1. Installation

```bash
npm install @eidos.space/client @eidos.space/react
```

### 2. Setup

Initialize the client and set it to the Eidos store. You can do this at the root of your application.

```tsx
import { useEffect } from "react"
import { createEidosClient } from "@eidos.space/client"
import { createEidos, useEidosStore } from "@eidos.space/react"

function App() {
  const { setEidos } = useEidosStore()

  useEffect(() => {
    // 1. Create the RPC client
    const client = createEidosClient({
      endpoint: "http://localhost:3000/rpc",
    })

    // 2. Wrap it with Eidos SDK interface
    // createEidos adds helper methods like AI and utils
    const eidos = createEidos(client.currentSpace)

    // 3. Set to global store
    setEidos(eidos)
  }, [setEidos])

  return (
    <div className="App">
      <BlogPostList />
    </div>
  )
}
```

### 3. Usage in Components

Now you can use the `useEidos` hook in any component to access your data.

```tsx
import { useEidos } from "@eidos.space/react"
import { useQuery } from "@tanstack/react-query"

export function BlogPostList() {
  const eidos = useEidos()

  // Example with TanStack Query
  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: () =>
      eidos.currentSpace.table("posts").findMany({
        orderBy: { created_at: "desc" },
      }),
  })

  if (isLoading) return <div>Loading...</div>

  return (
    <ul>
      {posts?.map((post) => (
        <li key={post._id}>{post.name}</li>
      ))}
    </ul>
  )
}
```

## Configuration

The `createEidosClient` function accepts a configuration object:

| Option     | Type           | Description                                              |
| ---------- | -------------- | -------------------------------------------------------- |
| `endpoint` | `string`       | The RPC endpoint URL (e.g., `http://localhost:3000/rpc`) |
| `timeout`  | `number`       | Request timeout in milliseconds (default: 30000)         |
| `fetch`    | `typeof fetch` | Custom fetch implementation (optional)                   |
| `apiKey`   | `string`       | API Key for authentication (optional)                    |

> **Note on localhost subdomains:** The client automatically handles `*.localhost` URLs (e.g., `http://space1.localhost:3000/rpc`) to work around DNS issues. When such URLs are detected, the client will:
>
> - Rewrite the request to `127.0.0.1` (bypassing DNS resolution)
> - Preserve the original subdomain in the `Host` header
> - Add `X-Forwarded-Host` header for compatibility
>
> This ensures reliable communication with the Eidos Desktop RPC server when using subdomains.

## Features

- **Prisma-style API**: Type-safe (when used with generated types) and intuitive CRUD operations.
- **Isomorphic**: Works in Node.js, browsers, and Edge functions.
- **Minimal Footprint**: Lightweight proxy-based implementation.
- **Deep Integration**: First-class support for Eidos features like Graft sync, Files, and KV storage.
