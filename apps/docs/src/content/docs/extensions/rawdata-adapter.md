---
title: RawData Adapter
description: A protocol for synchronizing external data into the Eidos personal economic model.
sidebar:
  order: 5
---

RawData adapters are TypeScript modules that enable Eidos to pull, transform, and store data from external websites and services into a unified personal database.

## 1. Overview

The synchronization pipeline consists of three main steps:
1.  **Fetch**: Retrieve raw data from external sources (API, Browser automation, or CLI).
2.  **Transform**: Map the raw JSON data to the Eidos Economic Model (Agents, Goods, and Relations).
3.  **Query**: Define a standard SQL view to present the raw data in the Eidos UI.

## 2. Directory Structure

### Built-in Adapters
If you are contributing to the Eidos source code, adapters live in:
`packages/rawdata/src/adapters/<domain>/<name>.ts`

### User-space Adapters
If you want to add adapters to your local Eidos space without modifying the source code, place them in:
`<Your Space Root>/.eidos/.rawdata/`

Any `.ts`, `.js`, or `.mjs` file in this directory will be automatically scanned and loaded by Eidos Desktop. User-space adapters can override or extend built-in ones.

## 3. Implementation Guide

Use the `defineAdapter` helper to create a type-safe adapter.

```typescript
import { defineAdapter, $ } from "@eidos.space/rawdata"

export default defineAdapter({
  meta: {
    site: "example",
    name: "posts",
    description: "My posts on Example.com",
    domain: "example.com",
    version: "1.0",
  },

  protocol: {
    // Strategy: "public", "cookie", "auth", or "oauth"
    strategy: "public",
    // browser: Set to true for headless browser automation
    browser: false,
    // binaries: List of required CLI tools (e.g., ["gh"])
    binaries: [],
  },

  sync: {
    incremental: true,
  },

  /**
   * Step 1: Fetch raw data
   */
  async fetch(ctx) {
    // ctx provides http, browser, and exec contexts
    const response = await ctx.http.get("https://api.example.com/posts")
    return response.map((item: any) => ({
      entityType: "post",
      entityId: String(item.id),
      data: item,
    }))
  },

  /**
   * Step 2: Transform to Economic Model
   */
  transform(raw) {
    const post = raw.data
    const authorId = $.id("example_user", post.author)
    const postId = $.id("example_post", post.id)

    return {
      agents: [
        {
          id: authorId,
          role: "producer",
          name: post.author,
          fingerprints: $.fingerprint("example", post.author),
        },
      ],
      goods: [
        {
          id: postId,
          category: "post",
          title: post.title,
          summary: post.content.slice(0, 100),
          producedBy: authorId,
          fingerprints: $.fingerprint("example", post.id),
          useValue: {
            url: `https://example.com/posts/${post.id}`,
            text: post.content,
          },
        },
      ],
      relations: [
        {
          type: "PRODUCES",
          subject_type: "agent",
          subject_id: authorId,
          object_type: "good",
          object_id: postId,
        },
      ],
    }
  },

  /**
   * Step 3: Default SQL View
   */
  queries: {
    raw: `
      -- @search {title, content}
      SELECT 
        id,
        json_extract(data, '$.title') as title,
        json_extract(data, '$.content') as content
      FROM raw.data
      WHERE source = 'example/posts'
    `,
  },
})
```

## 4. Execution Contexts

### HTTP (`ctx.http`)
Ideal for public APIs or simple web endpoints. Eidos handles proxying and CORS in managed environments.

### Browser (`ctx.browser`)
Used for sites that require browser-based authentication or lack an API.
```typescript
await ctx.browser.navigate("https://example.com/login")
// Perform automation...
```

### CLI (`ctx.exec`)
Enables wrapping existing terminal tools. You must declare these tools in `protocol.binaries`.
```typescript
const { stdout } = await ctx.exec.run("gh", ["api", "/user"])
```

## 5. Mapping with `$`

The `$` utility ensemble ensures your data fits the Eidos schema:
- `$.id()`: Generates deterministic UUIDs.
- `$.fingerprint()`: Handles cross-platform identity resolution.
- `$.string()`: Safely extracts values from untrusted JSON.

## 6. Testing & Debugging

### In Eidos Desktop
1. Go to **Settings > Browser** and enable **Raw Data**.
2. Navigate to the website in the built-in browser.
3. If a matching adapter (built-in or user-space) is found, the Raw Data icon will appear in the **tab bar** next to the page title.
4. Right-click on the page or use the context menu to trigger the sync (or click the icon if interactive mode is enabled).
5. You can view real-time logs and progress hints directly in the sync overlay.

### Local Development Tips
- **Live Reload**: Eidos Desktop watches your `.eidos/.rawdata/` folder. Changes to adapter files are detected and reloaded automatically.
- **Transpilation**: You can write pure TypeScript (`.ts`). Eidos Desktop handles the transpilation on the fly.
- **Logs**: Use `ctx.log("message")` to output debug information to the UI.
