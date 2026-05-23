import { parseArgs } from "node:util"
import { z } from "zod"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface CommandOption {
  name: string
  short?: string
  type: "string" | "boolean"
  description: string
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

type TemplatePart =
  | { kind: "literal"; value: string }
  | { kind: "required"; name: string }
  | { kind: "optional"; name: string }

export class CommandDefinition {
  template: TemplatePart[] = []
  options: CommandOption[] = []
  desc: string = ""
  zodSchema?: z.ZodSchema<any>
  actionFn?: (data: any, context?: any) => Promise<ExecResult> | ExecResult

  constructor(commandStr: string) {
    const parts = commandStr.split(" ").filter(Boolean)
    for (const part of parts) {
      if (part.startsWith("<") && part.endsWith(">")) {
        this.template.push({ kind: "required", name: part.slice(1, -1) })
      } else if (part.startsWith("[") && part.endsWith("]")) {
        this.template.push({ kind: "optional", name: part.slice(1, -1) })
      } else {
        this.template.push({ kind: "literal", value: part })
      }
    }
  }

  description(desc: string): this {
    this.desc = desc
    return this
  }

  option(flags: string, description: string): this {
    const parts = flags.split(",").map((p) => p.trim())
    let short: string | undefined
    let long = ""
    let isString = false

    for (const part of parts) {
      if (part.startsWith("--")) {
        const cleanPart = part.split(" ")[0]
        long = cleanPart.slice(2)
        if (part.includes("<") || part.includes("[")) {
          isString = true
        }
      } else if (part.startsWith("-")) {
        short = part.slice(1, 2)
      }
    }

    if (!long) {
      const cleanSingle = parts[0].split(" ")[0]
      long = cleanSingle.startsWith("-")
        ? cleanSingle.replace(/^-+/, "")
        : cleanSingle
    }

    this.options.push({
      name: long,
      short,
      type: isString ? "string" : "boolean",
      description,
    })
    return this
  }

  schema(schema: z.ZodSchema<any>): this {
    this.zodSchema = schema
    return this
  }

  action(
    fn: (data: any, context?: any) => Promise<ExecResult> | ExecResult
  ): this {
    this.actionFn = fn
    return this
  }

  /** Get a human-readable usage string for this command. */
  usage(cliName: string): string {
    const parts = this.template.map((p) => {
      if (p.kind === "literal") return p.value
      if (p.kind === "required") return `<${p.name}>`
      return `[${p.name}]`
    })
    const optionsStr = this.options.length
      ? "\nOptions:\n" +
        this.options.map((o) => `  --${o.name}  ${o.description}`).join("\n")
      : ""
    return `Usage: ${cliName} ${parts.join(" ")}${optionsStr}`
  }
}

export class LightCli {
  name: string
  commands: CommandDefinition[] = []

  constructor(name: string) {
    this.name = name
  }

  command(commandStr: string): CommandDefinition {
    const cmd = new CommandDefinition(commandStr)
    this.commands.push(cmd)
    return cmd
  }

  async parse(args: string[], context?: any): Promise<ExecResult> {
    // Find matching command: walks args and template in lock-step.
    // Literals must match exactly; placeholders consume one arg each.
    let matchedCmd: CommandDefinition | undefined
    let bestScore = -1

    for (const cmd of this.commands) {
      const result = this.tryMatch(cmd.template, args)
      if (result && result.literals > bestScore) {
        matchedCmd = cmd
        bestScore = result.literals
      }
    }

    if (!matchedCmd) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Unknown action: "${args.slice(0, 2).join(" ")}"\n\n${this.help()}`,
      }
    }

    const { params, consumed } = this.tryMatch(matchedCmd.template, args)!
    const remainingArgs = args.slice(consumed)

    // Build options config for node:util's parseArgs
    const optionsConfig: Record<string, any> = {}
    for (const opt of matchedCmd.options) {
      optionsConfig[opt.name] = {
        type: opt.type,
        short: opt.short,
      }
    }

    try {
      const { values } = parseArgs({
        args: remainingArgs,
        options: optionsConfig,
        strict: false,
        allowPositionals: true,
      })

      // Convert option keys to camelCase
      const parsedOptions: Record<string, any> = {}
      for (const [k, v] of Object.entries(values)) {
        parsedOptions[toCamelCase(k)] = v
      }

      // Merge: options serve as fallback for same-named positional params
      const combinedInput: Record<string, any> = {}
      for (const [k, v] of Object.entries(parsedOptions)) {
        combinedInput[k] = v
      }
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          combinedInput[k] = v
        }
      }

      // Validate with Zod Schema if present
      let finalData = combinedInput
      if (matchedCmd.zodSchema) {
        const parsed = matchedCmd.zodSchema.safeParse(combinedInput)
        if (!parsed.success) {
          return this.formatZodError(parsed.error, matchedCmd.usage(this.name))
        }
        finalData = parsed.data
      }

      // Run the action callback
      if (matchedCmd.actionFn) {
        return await matchedCmd.actionFn(finalData, context)
      }

      return { exitCode: 0, stdout: "", stderr: "" }
    } catch (err: any) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Error: ${err.message}\n\n${matchedCmd.usage(this.name)}`,
      }
    }
  }

  /** Try to match a template against args. Returns params + arg count consumed, or null. */
  private tryMatch(
    template: TemplatePart[],
    args: string[]
  ): {
    params: Record<string, any>
    consumed: number
    literals: number
  } | null {
    const params: Record<string, any> = {}
    let argIdx = 0
    let literals = 0

    for (const part of template) {
      if (argIdx >= args.length) {
        // Allow trailing optional placeholders to be missing
        if (part.kind === "optional") {
          params[toCamelCase(part.name)] = undefined
          continue
        }
        return null
      }

      if (part.kind === "literal") {
        if (args[argIdx] !== part.value) return null
        argIdx++
        literals++
      } else {
        // Placeholder — consume value, skip flag-looking values for optionals
        const val = args[argIdx]
        if (part.kind === "optional" && val?.startsWith("-")) {
          params[toCamelCase(part.name)] = undefined
          // Don't increment argIdx — let parseArgs handle the flags
          continue
        }
        params[toCamelCase(part.name)] = val
        argIdx++
      }
    }

    return { params, consumed: argIdx, literals }
  }

  private formatZodError(error: z.ZodError, usage: string): ExecResult {
    const messages = error.errors
      .map((err) => {
        const field = err.path.join(".")
        return `• ${field ? `[${field}] ` : ""}${err.message}`
      })
      .join("\n")
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error: Invalid command arguments\n${messages}\n\n${usage}`,
    }
  }

  help(): string {
    const helpLines = [
      `${this.name} <resource> <action> [args...]\n\nResources & actions:`,
    ]
    for (const cmd of this.commands) {
      const usage = cmd.usage(this.name)
      helpLines.push(`  ${usage}`)
      if (cmd.desc) {
        helpLines.push(`    ${cmd.desc}`)
      }
    }
    return helpLines.join("\n")
  }
}
