import type { AIFormValues } from "@/packages/ai/config"
import {
  buildProviderOptions,
  resolveProviderForModel,
} from "@/packages/ai/server/model"
import { initSkillToolkit } from "@/packages/ai/server/skills"
import {
  ToolLoopAgent,
  convertToModelMessages,
  extractReasoningMiddleware,
  isToolUIPart,
  stepCountIs,
  wrapLanguageModel,
  type UIMessage,
} from "ai"

import type {
  FileSpaceAgentMention,
  FileSpaceAgentMessage,
  FileSpaceAgentThinkingLevel,
} from "./types"

interface PrepareFileSpaceAgentRuntimeInput {
  goal: string
  messages: FileSpaceAgentMessage[]
  instructions: string
  model: string
  thinking: FileSpaceAgentThinkingLevel
  skills: string[]
  mentions: FileSpaceAgentMention[]
  tools: Record<string, unknown>
  aiConfig: AIFormValues
}

export interface PreparedFileSpaceAgentRuntime {
  agent: ToolLoopAgent
  modelMessages: unknown[]
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function sanitizeMessages(messages: FileSpaceAgentMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message as UIMessage
    return {
      ...message,
      parts: message.parts.filter(
        (part) =>
          !isToolUIPart(part as never) ||
          part.state === "output-available" ||
          part.state === "output-error" ||
          part.state === "output-denied"
      ),
    } as UIMessage
  })
}

function addRuntimeContext(
  messages: UIMessage[],
  input: Pick<PrepareFileSpaceAgentRuntimeInput, "goal" | "mentions" | "skills">
): UIMessage[] {
  const context = [
    `<goal>${escapeXml(input.goal)}</goal>`,
    `Today's date is ${new Date().toLocaleString()}.`,
  ]
  if (input.mentions.length > 0) {
    context.push(
      `<referenced-space-resources>\n${input.mentions
        .map(
          (mention) =>
            `  <resource path="${escapeXml(mention.id)}" type="${escapeXml(mention.type)}" name="${escapeXml(mention.name)}"/>`
        )
        .join("\n")}\n</referenced-space-resources>`
    )
  }
  if (input.skills.length > 0) {
    context.push(
      `<requested-skills>${escapeXml(input.skills.join(", "))}</requested-skills>`
    )
  }

  let firstUser = true
  return messages.map((message) => {
    if (message.role !== "user" || !firstUser) return message
    firstUser = false
    return {
      ...message,
      parts: message.parts.map((part, index) =>
        index === 0 && part.type === "text"
          ? {
              ...part,
              text: `<file-space-runtime-context>\n${context.join("\n")}\n</file-space-runtime-context>\n\n${part.text}`,
            }
          : part
      ),
    }
  })
}

/**
 * The native file-Space runtime. It intentionally does not call the legacy
 * DataSpace Agent API or create legacy DataSpace, Bash, or VFS tools.
 */
export async function prepareFileSpaceAgentRuntime(
  input: PrepareFileSpaceAgentRuntimeInput
): Promise<PreparedFileSpaceAgentRuntime> {
  const { modelId, provider, providerType } = resolveProviderForModel(
    input.model,
    input.aiConfig
  )
  if (!modelId) throw new Error("The selected Agent model is unavailable")

  const toolkit = input.skills.length > 0 ? await initSkillToolkit() : null
  const selectedSkills = toolkit?.skills.filter((skill) =>
    input.skills.includes(skill.name)
  )
  const skillContext = selectedSkills?.length
    ? `\n\nSelected skills:\n${selectedSkills
        .map(
          (skill) =>
            `- ${skill.name}: ${skill.description}. Load it with the skill tool before following it.`
        )
        .join("\n")}`
    : ""
  const tools = {
    ...(selectedSkills?.length && toolkit ? { skill: toolkit.skill } : {}),
    ...input.tools,
  }
  const providerOptions = buildProviderOptions(providerType, input.thinking)
  const agent = new ToolLoopAgent({
    model: wrapLanguageModel({
      model: provider(modelId),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    instructions: `${input.instructions}${skillContext}`,
    tools: tools as Record<string, any>,
    stopWhen: stepCountIs(100),
    ...(providerOptions ? { providerOptions } : {}),
  })
  const uiMessages = addRuntimeContext(sanitizeMessages(input.messages), input)
  return {
    agent,
    modelMessages: await convertToModelMessages(uiMessages),
  }
}
