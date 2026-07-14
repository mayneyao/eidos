---
title: AI API 参考
description: Eidos AI 功能完整 API 参考
sidebar:
  order: 1
---

`eidos.AI` 对象提供强大的文本生成和结构化数据处理的人工智能功能。

## Methods

### `generateText(options: GenerateTextOptions)`

使用 AI 模型生成文本内容。

```typescript
generateText(options: {
  model: string
  prompt: string
  temperature?: number
  maxTokens?: number
}): Promise<string>
```

**参数:**

- `model` (string): 要使用的 AI 模型（例如："google/gemini-2.5-flash-lite@openrouter"）
- `prompt` (string): 文本生成的输入提示
- `temperature` (number, 可选): 控制随机性（0-1，默认值因模型而异）
- `maxTokens` (number, 可选): 生成的最大令牌数

**示例:**

```typescript
const summary = await eidos.AI.generateText({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: "总结以下文档：\n\n" + documentContent,
  temperature: 0.7,
  maxTokens: 500,
})

console.log("生成的摘要:", summary)
```

**常见用例:**

```typescript
// 文档摘要
const summary = await eidos.AI.generateText({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: `用3个要点总结这个文档：\n\n${documentContent}`,
})

// 内容生成
const content = await eidos.AI.generateText({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: "写一封关于项目更新的专业邮件",
  temperature: 0.8,
})

// 翻译
const translation = await eidos.AI.generateText({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: `将以下文本翻译成西班牙语：\n\n${englishText}`,
})
```

### `generateObject(options: GenerateObjectOptions)`

使用 AI 模型生成结构化数据对象，支持模式验证。

```typescript
generateObject(options: {
  model: string
  prompt: string
  schema: JsonSchema7ObjectType
  temperature?: number
  maxTokens?: number
}): Promise<Record<string, any>>
```

**参数:**

- `model` (string): 要使用的 AI 模型
- `prompt` (string): 对象生成的输入提示
- `schema` (JsonSchema7ObjectType): 定义预期对象结构的 JSON 模式
- `temperature` (number, 可选): 控制随机性（0-1，默认值因模型而异）
- `maxTokens` (number, 可选): 生成的最大令牌数

**示例:**

```typescript
const result = await eidos.AI.generateObject({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: "计算以下文档的卡路里：\n" + mealDocument,
  schema: {
    type: "object",
    properties: {
      calories: {
        type: "number",
        description: "餐食总卡路里",
      },
      protein: {
        type: "number",
        description: "蛋白质含量（克）",
      },
      carbs: {
        type: "number",
        description: "碳水化合物含量（克）",
      },
    },
    required: ["calories"],
  },
  temperature: 0.3,
})

console.log("营养数据:", result)
// 输出: { calories: 450, protein: 25, carbs: 30 }
```

**常见用例:**

```typescript
// 文档分析
const analysis = await eidos.AI.generateObject({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: `分析这个文档并提取关键信息：\n\n${documentContent}`,
  schema: {
    type: "object",
    properties: {
      category: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
      tags: { type: "array", items: { type: "string" } },
      sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
    },
    required: ["category", "priority"],
  },
})

// 数据提取
const extractedData = await eidos.AI.generateObject({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: `从这段文本中提取联系信息：\n\n${textContent}`,
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      company: { type: "string" },
    },
    required: ["name", "email"],
  },
})
```
