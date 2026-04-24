---
title: RawData 适配器
description: 将外部数据同步到 Eidos 个人经济模型的协议。
sidebar:
  order: 5
---

RawData 适配器是基于 TypeScript 的模块，它允许 Eidos 从外部网站和服务器获取数据，并将其转换并存储到统一的个人数据库中。

## 1. 流程概览

同步流水线包含三个主要步骤：
1.  **获取 (Fetch)**：从外部来源（API、浏览器自动化或命令行工具）检索原始数据。
2.  **转换 (Transform)**：将原始 JSON 数据映射到 Eidos 经济模型（Agent、Good 和 Relation）。
3.  **查询 (Query)**：定义标准的 SQL 视图，以便在 Eidos UI 中展示这些原始数据。

## 2. 目录结构

### 内置适配器
如果你正在为 Eidos 源码做贡献，适配器存放在：
`packages/rawdata/src/adapters/<domain>/<name>.ts`

### 用户态适配器 (User-space)
如果你想在不修改源码的情况下为自己的本地空间添加适配器，请将其放置在：
`<你的空间根目录>/.eidos/.rawdata/`

该目录（及其子目录）下的任何 `.ts`、`.js` 或 `.mjs` 文件都会被 Eidos Desktop 自动扫描并加载。用户态适配器可以覆盖或扩展内置适配器。

## 3. 实现指南

使用 `defineAdapter` 助手函数创建一个类型安全的适配器。

```typescript
import { defineAdapter, $ } from "@eidos.space/rawdata"

export default defineAdapter({
  meta: {
    site: "example",
    name: "posts",
    description: "我在 Example.com 的文章",
    domain: "example.com",
    version: "1.0",
  },

  protocol: {
    // 策略: "public", "cookie", "auth", 或 "oauth"
    strategy: "public",
    // browser: 如果需要浏览器自动化，设置为 true
    browser: false,
    // binaries: 所需的命令行工具列表 (例如 ["gh"])
    binaries: [],
  },

  sync: {
    incremental: true,
  },

  /**
   * 第一步：获取原始数据
   */
  async fetch(ctx) {
    // ctx 提供了 http, browser 和 exec 上下文
    const response = await ctx.http.get("https://api.example.com/posts")
    return response.map((item: any) => ({
      entityType: "post",
      entityId: String(item.id),
      data: item,
    }))
  },

  /**
   * 第二步：转换为经济模型
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
   * 第三步：默认 SQL 视图
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

## 4. 执行上下文 (Contexts)

### HTTP (`ctx.http`)
适用于公开 API。Eidos 在受控环境中会自动处理代理和跨域问题。

### 浏览器 (`ctx.browser`)
适用于需要登录或没有 API 的站点。
```typescript
await ctx.browser.navigate("https://example.com/login")
// 执行自动化操作...
```

### 命令行 (`ctx.exec`)
允许封装现有的终端工具。你必须在 `protocol.binaries` 中声明这些工具。
```typescript
const { stdout } = await ctx.exec.run("gh", ["api", "/user"])
```

## 5. 数据映射助手 `$`

`$` 工具集确保你的数据符合 Eidos 的 Schema 规范：
- `$.id()`：生成确定的 UUID。
- `$.fingerprint()`：处理跨平台身份识别。
- `$.string()`：从不可信的 JSON 中安全提取值。

## 6. 测试与调试

### 在 Eidos 桌面端
1. 进入 **设置 > 浏览器** 并开启 **Raw Data**。
2. 在内置浏览器中访问目标网站。
3. 如果匹配到适配器（无论是内置的还是用户态的），**Tab 标签页** 的标题旁会出现 Raw Data 图标。
4. 你可以通过右键菜单或上下文菜单触发同步（如果适配器支持交互，也可点击图标）。
5. 你可以直接在同步浮层中查看实时日志和进度提示。

### 本地开发建议
- **热重载**：Eidos Desktop 会监听 `.eidos/.rawdata/` 文件夹的变化。修改适配器代码后，系统会自动重新加载。
- **自动转译**：你可以直接编写原生的 TypeScript (`.ts`) 文件。Eidos 会在运行时自动处理转译。
- **调试日志**：使用 `ctx.log("消息内容")` 将调试信息输出到 UI 界面上。
