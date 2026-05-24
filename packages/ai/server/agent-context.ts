import type { UIMessage } from "ai"
import type { SkillToolkit } from "./skills/skill-tool"
import { initSkillToolkit } from "./skills"

/**
 * Three-layer context system for the AI agent, similar to Claude Code:
 *
 * 1. **System Prompt**  — the base persona / behavior instructions
 * 2. **System Context** — appended to system prompt (environment, tool info, etc.)
 * 3. **User Context**   — injected into the first user message (date, workspace state, etc.)
 */
export class AgentContext {
  private _systemPrompt = ""
  private _systemContext: string[] = []
  private _userContext: string[] = []
  private _skillToolkit: SkillToolkit | null = null
  private _requestedSkills: string[] = []
  private _mentionsBlock: string | null = null
  private _log: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  } = console

  /** Create an agent context with the default system prompt and built-in user context. */
  static async create(opts: {
    goal: string
    tools: string[]
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
    ctx.setSystemPrompt(
      opts.systemPrompt ??
        AgentContext.buildDefaultPrompt(opts.goal, opts.tools)
    )
    ctx.addUserContext(`Today's date is ${new Date().toLocaleString()}.`)

    // Store mentions block for injection into every user message
    if (opts.mentions && opts.mentions.length > 0) {
      const lines = opts.mentions.map(
        (m) => `  <node id="${m.id}" type="${m.type}" name="${m.name}"/>`
      )
      ctx._mentionsBlock = `<referenced-nodes>\n${lines.join("\n")}\n</referenced-nodes>\nUse the IDs above directly with eidos commands.`
    }

    // Initialize skills if requested
    if (opts.skills && opts.skills.length > 0) {
      await ctx.loadSkills(opts.skills)
    }

    return ctx
  }

  private static buildDefaultPrompt(goal: string, tools: string[]): string {
    return `You are an autonomous AI agent running in the Eidos data workspace.
Your goal is: ${goal}

Available tools: ${tools.join(", ")}

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
    this._userContext.push(context)
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
   * Prepend user context and mentions to every user message.
   * Mentions go first (stable across turns for LLM caching),
   * user context follows.
   */
  buildMessages(messages: UIMessage[]): UIMessage[] {
    if (this._userContext.length === 0 && !this._mentionsBlock) return messages

    return messages.map((msg) => {
      if (msg.role !== "user") return msg
      const parts = msg.parts.map((part, i) => {
        if (i === 0 && part.type === "text") {
          let prefix = ""
          if (this._mentionsBlock) prefix += this._mentionsBlock + "\n\n"
          const contextBlock =
            this._userContext.length > 0
              ? `<user-context>\n${this._userContext.join("\n")}\n</user-context>\n\n`
              : ""
          prefix += contextBlock
          return { ...part, text: `${prefix}${part.text}` }
        }
        return part
      })
      return { ...msg, parts }
    })
  }
}
