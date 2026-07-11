export interface GraftPragmaExecutor {
  execute(
    repositoryPath: string,
    pragma: string,
    argument?: string
  ): Promise<unknown>
  close?(repositoryPath?: string): Promise<void> | void
}

export interface GraftRunOptions {
  timeoutMs?: number
  maxBufferBytes?: number
}

const JSON_COMMAND_PRAGMAS = {
  add: "json_add",
  commit: "json_commit",
  diff: "json_diff",
  log: "json_log",
  restore: "json_restore",
  show: "json_show",
  status: "json_status",
} as const

type SupportedCommand = keyof typeof JSON_COMMAND_PRAGMAS

function quotePragmaWord(value: string): string {
  if (value.includes("\0"))
    throw new Error("Graft arguments cannot contain NUL")
  return `"${value.replace(/(["\\])/g, "\\$1")}"`
}

function serializeArguments(args: readonly string[]): string | undefined {
  if (args.length === 0) return undefined
  return args
    .map((argument) =>
      argument === "--" || argument.startsWith("--")
        ? argument
        : quotePragmaWord(argument)
    )
    .join(" ")
}

function commandArgument(
  command: SupportedCommand,
  args: readonly string[]
): string | undefined {
  const commandArgs = args.slice(1).filter((argument) => argument !== "--json")
  switch (command) {
    case "status":
      if (commandArgs.length > 0) {
        throw new Error("Graft status does not accept repository arguments")
      }
      return undefined
    case "commit": {
      const messageIndex = commandArgs.findIndex(
        (argument) => argument === "-m" || argument === "--message"
      )
      const message =
        messageIndex >= 0 ? commandArgs[messageIndex + 1] : undefined
      if (!message) throw new Error("Graft commit requires a message")
      return message
    }
    case "show": {
      const target = commandArgs.find((argument) => argument !== "--")
      if (!target) throw new Error("Graft show requires a revision")
      return target
    }
    case "log": {
      const pagination = serializeArguments(commandArgs)
      return pagination ? `--with-status ${pagination}` : "--with-status"
    }
    default:
      return serializeArguments(commandArgs)
  }
}

export class GraftClient {
  constructor(private readonly executor: GraftPragmaExecutor) {}

  async runJson(
    repositoryPath: string,
    args: readonly string[],
    _options: GraftRunOptions = {}
  ): Promise<unknown> {
    const command = args[0] as SupportedCommand | undefined
    if (!command || !(command in JSON_COMMAND_PRAGMAS)) {
      throw new Error(
        `Unsupported persistent Graft command: ${command ?? "<empty>"}`
      )
    }
    return this.executor.execute(
      repositoryPath,
      JSON_COMMAND_PRAGMAS[command],
      commandArgument(command, args)
    )
  }

  close(repositoryPath?: string) {
    return this.executor.close?.(repositoryPath)
  }
}
