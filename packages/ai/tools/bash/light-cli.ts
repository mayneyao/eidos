import { parseArgs } from "node:util"
import { z } from "zod"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface CommandOption {
  name: string // e.g., "type"
  short?: string // e.g., "t"
  type: "string" | "boolean"
  description: string
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

export class CommandDefinition {
  route: string[] = []
  placeholders: { name: string; required: boolean }[] = []
  options: CommandOption[] = []
  desc: string = ""
  zodSchema?: z.ZodSchema<any>
  actionFn?: (data: any, context?: any) => Promise<ExecResult> | ExecResult

  constructor(commandStr: string) {
    const parts = commandStr.split(" ").filter(Boolean)
    for (const part of parts) {
      if (part.startsWith("<") && part.endsWith(">")) {
        this.placeholders.push({ name: part.slice(1, -1), required: true })
      } else if (part.startsWith("[") && part.endsWith("]")) {
        this.placeholders.push({ name: part.slice(1, -1), required: false })
      } else {
        this.route.push(part)
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
    // 1. Find a matching command
    let matchedCmd: CommandDefinition | undefined
    let matchedRouteLength = 0

    for (const cmd of this.commands) {
      const route = cmd.route
      let match = true
      for (let i = 0; i < route.length; i++) {
        if (args[i] !== route[i]) {
          match = false
          break
        }
      }
      if (match && route.length > matchedRouteLength) {
        matchedCmd = cmd
        matchedRouteLength = route.length
      }
    }

    if (!matchedCmd) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Unknown action: "${args.slice(0, 2).join(" ")}"\n\n${this.help()}`,
      }
    }

    // 2. Extract remaining arguments to parse flags and positionals
    const remainingArgs = args.slice(matchedRouteLength)

    // Build options config for node:util's parseArgs
    const optionsConfig: Record<string, any> = {}
    for (const opt of matchedCmd.options) {
      optionsConfig[opt.name] = {
        type: opt.type,
        short: opt.short,
      }
    }

    try {
      const { values, positionals } = parseArgs({
        args: remainingArgs,
        options: optionsConfig,
        strict: false,
        allowPositionals: true,
      })

      // 3. Map positionals to camelCased named placeholders
      const params: Record<string, any> = {}
      for (let i = 0; i < matchedCmd.placeholders.length; i++) {
        const ph = matchedCmd.placeholders[i]
        const val = positionals[i]
        if (ph.required && val === undefined) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: `Error: Missing required argument <${ph.name}>\n\n${this.getCommandUsage(matchedCmd)}`,
          }
        }
        params[toCamelCase(ph.name)] = val
      }

      // Convert option keys to camelCase as well for Zod consistency
      const parsedOptions: Record<string, any> = {}
      for (const [k, v] of Object.entries(values)) {
        parsedOptions[toCamelCase(k)] = v
      }

      // Merge params and options: options serve as fallback for same-named positional params
      const combinedInput: Record<string, any> = {}
      for (const [k, v] of Object.entries(parsedOptions)) {
        combinedInput[k] = v
      }
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          combinedInput[k] = v
        }
      }

      // 4. Validate with Zod Schema if present
      let finalData = combinedInput
      if (matchedCmd.zodSchema) {
        const parsed = matchedCmd.zodSchema.safeParse(combinedInput)
        if (!parsed.success) {
          return this.formatZodError(
            parsed.error,
            this.getCommandUsage(matchedCmd)
          )
        }
        finalData = parsed.data
      }

      // 5. Run the action callback
      if (matchedCmd.actionFn) {
        return await matchedCmd.actionFn(finalData, context)
      }

      return { exitCode: 0, stdout: "", stderr: "" }
    } catch (err: any) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Error: ${err.message}\n\n${this.getCommandUsage(matchedCmd)}`,
      }
    }
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

  private getCommandUsage(cmd: CommandDefinition): string {
    const routeStr = cmd.route.join(" ")
    const positionalStr = cmd.placeholders
      .map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`))
      .join(" ")
    const optionsStr = cmd.options.length
      ? "\nOptions:\n" +
        cmd.options.map((o) => `  --${o.name}  ${o.description}`).join("\n")
      : ""
    return `Usage: ${this.name} ${routeStr} ${positionalStr}${optionsStr}`
  }

  help(): string {
    const helpLines = [
      `${this.name} <resource> <action> [args...]\n\nResources & actions:`,
    ]
    for (const cmd of this.commands) {
      const routeStr = cmd.route.join(" ")
      const positionalStr = cmd.placeholders
        .map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`))
        .join(" ")
      const optionsHelp = cmd.options.map((o) => `--${o.name}`).join(" ")
      helpLines.push(
        `  ${this.name} ${routeStr} ${positionalStr} ${optionsHelp}`
      )
      if (cmd.desc) {
        helpLines.push(`    ${cmd.desc}`)
      }
    }
    return helpLines.join("\n")
  }
}
