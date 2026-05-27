import type { UIMessage } from "ai"
import type { SkillToolkit } from "./skills/skill-tool"
import { initSkillToolkit } from "./skills"

/**
 * Multi-layer context system for the AI agent, optimized for prompt caching:
 *
 * 1. **System Prompt**   — pure static persona / rules (cacheable across all requests)
 * 2. **System Context**  — appended to system prompt (skills, dynamic env info)
 * 3. **First User Context** — injected into the first user message only (goal, date, mentions)
 */
export class AgentContext {
  private _systemPrompt = ""
  private _systemContext: string[] = []
  private _firstUserContext: string[] = []
  private _skillToolkit: SkillToolkit | null = null
  private _requestedSkills: string[] = []
  private _log: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  } = console

  /** Create an agent context. System prompt is static and cacheable; goal/date go into the first user message. */
  static async create(opts: {
    goal: string
    systemPrompt?: string
    skills?: string[]
    mentions?: Array<{ id: string; name: string; type: string }>
    logger?: {
      info: (...args: any[]) => void
      warn: (...args: any[]) => void
      error: (...args: any[]) => void
    }
  }): Promise<AgentContext> {
    const ctx = new AgentContext()
    ctx._log = opts.logger ?? console

    // System prompt: fully static, cacheable across all requests
    ctx.setSystemPrompt(opts.systemPrompt ?? AgentContext.buildDefaultPrompt())

    // Goal, date, and mentions all go into first user message only (avoids cache invalidation)
    ctx.addFirstUserContext(`<goal>${opts.goal}</goal>`)
    ctx.addFirstUserContext(`Today's date is ${new Date().toLocaleString()}.`)
    if (opts.mentions && opts.mentions.length > 0) {
      const lines = opts.mentions.map(
        (m) => `  <node id="${m.id}" type="${m.type}" name="${m.name}"/>`
      )
      ctx.addFirstUserContext(
        `<referenced-nodes>\n${lines.join("\n")}\n</referenced-nodes>\nUse the IDs above directly with eidos commands.`
      )
    }

    // Initialize skills if requested
    if (opts.skills && opts.skills.length > 0) {
      await ctx.loadSkills(opts.skills)
    }

    return ctx
  }

  private static buildDefaultPrompt(): string {
    return `You are an autonomous AI agent running in the Eidos data workspace.

ENVIRONMENT RESTRICTIONS:
- The bash sandbox is a minimal environment. NO Python, Node.js, Ruby, or other
  language runtimes are installed. Do NOT attempt "python3", "node", or similar
  — they will fail and waste tokens.
- Only standard POSIX commands (cat, grep, awk, sed, curl, jq, etc.) plus the
  builtins (eidos, web-fetch, web-search) are available. Use these instead.

Instructions:
1. First, analyze the goal and plan your approach silently.
2. Execute the plan step-by-step using the available tools.
3. After each tool call, evaluate the result and decide the next action.
4. When the goal is fully achieved, provide a clear **Summary** of what was done.
5. If you encounter errors, try an alternative approach.

Be proactive. Don't ask for confirmation — just execute the plan.`
  }

  /** Load skills by name, initializing the toolkit if needed. */
  async loadSkills(skillNames: string[]): Promise<void> {
    this._requestedSkills = skillNames
    this._skillToolkit = await initSkillToolkit()
    if (!this._skillToolkit) return

    const requested = this._skillToolkit.skills.filter((s) =>
      skillNames.includes(s.name)
    )
    for (const skill of requested) {
      this.addSystemContext(
        `<skill name="${skill.name}">\nUse the skill tool to load full instructions: loadSkill("${skill.name}")\n</skill>`
      )
    }
    this._log.info("[agent-context] ▶ skills loaded", {
      requested: skillNames,
      loaded: requested.map((s) => s.name),
    })
  }

  /** The skill tool for the agent to call loadSkill("name") on demand. */
  get skillTool(): Record<string, any> | null {
    return this._skillToolkit ? { skill: this._skillToolkit.skill } : null
  }

  /** Extra instructions for the bash tool (skill discovery metadata). */
  get skillInstructions(): string | null {
    return this._skillToolkit && this._requestedSkills.length > 0
      ? this._skillToolkit.instructions
      : null
  }

  setSystemPrompt(prompt: string): this {
    this._systemPrompt = prompt
    return this
  }

  addSystemContext(context: string): this {
    this._systemContext.push(context)
    return this
  }

  addUserContext(context: string): this {
    this._firstUserContext.push(context)
    return this
  }

  addFirstUserContext(context: string): this {
    this._firstUserContext.push(context)
    return this
  }

  /** Assemble final instructions = system prompt + system context sections. */
  buildInstructions(): string {
    if (this._systemContext.length === 0) return this._systemPrompt
    return [
      this._systemPrompt,
      ...this._systemContext.map(
        (ctx) => `<system-context>\n${ctx}\n</system-context>`
      ),
    ].join("\n\n")
  }

  /**
   * Prepend context to the first user message only (goal, date, mentions).
   * Subsequent user messages are passed through unchanged — the model already
   * has the context from earlier turns.
   */
  buildMessages(messages: UIMessage[]): UIMessage[] {
    if (this._firstUserContext.length === 0) return messages

    let isFirstUser = true

    return messages.map((msg) => {
      if (msg.role !== "user") return msg
      const parts = msg.parts.map((part, i) => {
        if (i === 0 && part.type === "text" && isFirstUser) {
          isFirstUser = false
          const prefix = `<user-context>\n${this._firstUserContext.join("\n")}\n</user-context>\n\n`
          return { ...part, text: `${prefix}${part.text}` }
        }
        return part
      })
      return { ...msg, parts }
    })
  }
}
