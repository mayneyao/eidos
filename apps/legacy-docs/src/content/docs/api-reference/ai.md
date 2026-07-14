---
title: AI API Reference
description: Complete API reference for Eidos AI functionality
sidebar:
  order: 1
---

The `eidos.AI` object provides powerful artificial intelligence capabilities for text generation and structured data processing.

## Methods

### `generateText(options: GenerateTextOptions)`

Generate text content using AI models.

```typescript
generateText(options: {
  model: string
  prompt: string
  temperature?: number
  maxTokens?: number
}): Promise<string>
```

**Parameters:**

- `model` (string): The AI model to use (e.g., "google/gemini-2.5-flash-lite@openrouter")
- `prompt` (string): The input prompt for text generation
- `temperature` (number, optional): Controls randomness (0-1, default varies by model)
- `maxTokens` (number, optional): Maximum number of tokens to generate

**Example:**

```typescript
const summary = await eidos.AI.generateText({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: "Summarize the following document:\n\n" + documentContent,
  temperature: 0.7,
  maxTokens: 500,
})

console.log("Generated summary:", summary)
```

**Common Use Cases:**

```typescript
// Document summarization
const summary = await eidos.AI.generateText({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: `Summarize this document in 3 key points:\n\n${documentContent}`,
})

// Content generation
const content = await eidos.AI.generateText({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: "Write a professional email about project updates",
  temperature: 0.8,
})

// Translation
const translation = await eidos.AI.generateText({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: `Translate the following text to Spanish:\n\n${englishText}`,
})
```

### `generateObject(options: GenerateObjectOptions)`

Generate structured data objects using AI models with schema validation.

```typescript
generateObject(options: {
  model: string
  prompt: string
  schema: JsonSchema7ObjectType
  temperature?: number
  maxTokens?: number
}): Promise<Record<string, any>>
```

**Parameters:**

- `model` (string): The AI model to use
- `prompt` (string): The input prompt for object generation
- `schema` (JsonSchema7ObjectType): JSON schema defining the expected object structure
- `temperature` (number, optional): Controls randomness (0-1, default varies by model)
- `maxTokens` (number, optional): Maximum number of tokens to generate

**Example:**

```typescript
const result = await eidos.AI.generateObject({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: "Calculate the calories of the following document:\n" + mealDocument,
  schema: {
    type: "object",
    properties: {
      calories: {
        type: "number",
        description: "Total calories in the meal",
      },
      protein: {
        type: "number",
        description: "Protein content in grams",
      },
      carbs: {
        type: "number",
        description: "Carbohydrate content in grams",
      },
    },
    required: ["calories"],
  },
  temperature: 0.3,
})

console.log("Nutritional data:", result)
// Output: { calories: 450, protein: 25, carbs: 30 }
```

**Common Use Cases:**

```typescript
// Document analysis
const analysis = await eidos.AI.generateObject({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: `Analyze this document and extract key information:\n\n${documentContent}`,
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

// Data extraction
const extractedData = await eidos.AI.generateObject({
  model: "google/gemini-2.5-flash-lite@openrouter",
  prompt: `Extract contact information from this text:\n\n${textContent}`,
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
