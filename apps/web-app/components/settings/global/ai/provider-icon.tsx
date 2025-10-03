import React from "react"
import type { LLMProviderType } from "@/packages/ai/helper"
import {
  Anthropic,
  Aws,
  Azure,
  Cerebras,
  Cohere,
  DeepInfra,
  DeepSeek,
  Fireworks,
  Google,
  Groq,
  Mistral,
  Ollama,
  OpenAI,
  OpenRouter,
  Perplexity,
  Together,
  XAI,
} from "@lobehub/icons"

export const providerIcons = {
  google: <Google size={16} />,
  openai: <OpenAI size={16} />,
  anthropic: <Anthropic size={16} />,
  deepseek: <DeepSeek size={16} />,
  groq: <Groq size={16} />,
  xai: <XAI size={16} />,
  openrouter: <OpenRouter size={16} />,
  azure: <Azure size={16} />,
  "amazon-bedrock": <Aws size={16} />,
  // fal: <Fal size={16} />,
  deepinfra: <DeepInfra size={16} />,
  mistral: <Mistral size={16} />,
  togetherai: <Together size={16} />,
  cohere: <Cohere size={16} />,
  fireworks: <Fireworks size={16} />,
  cerebras: <Cerebras size={16} />,
  // replicate: <Replicate size={16} />,
  perplexity: <Perplexity size={16} />,
  // luma: <Luma size={16} />,
  ollama: <Ollama size={16} />,
  "openai-compatible": <OpenAI.Avatar size={16} />,
} as const satisfies Record<LLMProviderType, React.ReactNode>

const colorfulProviderIcons = {
  google: <Google.Color size={16} />,
  openai: <OpenAI.Avatar size={16} />,
  anthropic: <Anthropic.Avatar size={16} />,
  deepseek: <DeepSeek.Color size={16} />,
  groq: <Groq.Avatar size={16} />,
  xai: <XAI.Avatar size={16} />,
  openrouter: <OpenRouter.Avatar size={16} />,
  azure: <Azure.Avatar size={16} />,
  "amazon-bedrock": <Aws.Color size={16} />,
  // fal: <Fal.Avatar size={16} />,
  deepinfra: <DeepInfra.Avatar size={16} />,
  mistral: <Mistral.Avatar size={16} />,
  togetherai: <Together.Avatar size={16} />,
  cohere: <Cohere.Avatar size={16} />,
  fireworks: <Fireworks.Color size={16} />,
  cerebras: <Cerebras.Color size={16} />,
  // replicate: <Replicate.Avatar size={16} />,
  perplexity: <Perplexity.Color size={16} />,
  // luma: <Luma.Avatar size={16} />,
  ollama: <Ollama.Avatar size={16} />,
  "openai-compatible": <OpenAI.Avatar size={16} />,
} as const satisfies Record<LLMProviderType, React.ReactNode>

interface ProviderIconProps {
  type: LLMProviderType
  isActive?: boolean
  className?: string
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({
  type,
  isActive = false,
  className,
}) => {
  const IconComponent = isActive
    ? colorfulProviderIcons[type]
    : providerIcons[type]

  if (!IconComponent) {
    return null // Or return a default icon/placeholder
  }

  return (
    <div className={`flex-shrink-0 ${className || ""}`}>{IconComponent}</div>
  )
}

export default ProviderIcon
