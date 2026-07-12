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
  "branch-upstream": "json_branch_upstream",
  commit: "json_commit",
  conflicts: "json_conflicts",
  diff: "json_diff",
  fetch: "json_fetch",
  log: "json_log",
  "merge-continue": "json_merge_continue",
  pull: "json_pull",
  push: "json_push",
  resolve: "json_resolve_conflict",
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

function requirePlainPragmaWord(value: string, label: string): string {
  if (!value || value.includes("\0") || /\s/.test(value)) {
    throw new Error(`${label} must be one non-empty word`)
  }
  return value
}

function serializeRemoteBranchArguments(
  command: "fetch" | "pull" | "push",
  args: readonly string[]
): string | undefined {
  const allowedFlags =
    command === "push"
      ? new Set(["--all", "--force", "-f"])
      : command === "fetch"
        ? new Set(["--all"])
        : new Set<string>()
  return args.length === 0
    ? undefined
    : args
        .map((argument) =>
          argument.startsWith("-")
            ? allowedFlags.has(argument)
              ? argument
              : (() => {
                  throw new Error(
                    `Unsupported Graft ${command} flag: ${argument}`
                  )
                })()
            : requirePlainPragmaWord(argument, `Graft ${command} argument`)
        )
        .join(" ")
}

function remoteCommand(args: readonly string[]): {
  pragma: string
  argument?: string
} {
  const [subcommand, ...values] = args
  switch (subcommand) {
    case "list":
      if (values.length > 0) {
        throw new Error("Graft remote list does not accept arguments")
      }
      return { pragma: "json_remotes" }
    case "add":
    case "set-url": {
      if (values.length !== 2) {
        throw new Error(`Graft remote ${subcommand} requires a name and URL`)
      }
      const name = requirePlainPragmaWord(values[0], "Graft remote name")
      const url = values[1]
      if (!url || url.includes("\0") || /[\r\n]/.test(url)) {
        throw new Error("Graft remote URL is invalid")
      }
      return {
        pragma:
          subcommand === "add" ? "json_remote_add" : "json_remote_set_url",
        // Graft v0.5 treats everything after the first whitespace as the URI,
        // which preserves local fs:// paths containing spaces.
        argument: `${name} ${url}`,
      }
    }
    case "remove": {
      if (values.length !== 1) {
        throw new Error("Graft remote remove requires one name")
      }
      return {
        pragma: "json_remote_remove",
        argument: requirePlainPragmaWord(values[0], "Graft remote name"),
      }
    }
    default:
      throw new Error(
        `Unsupported persistent Graft remote command: ${subcommand ?? "<empty>"}`
      )
  }
}

function commandArgument(
  command: SupportedCommand,
  args: readonly string[]
): string | undefined {
  const commandArgs = args.slice(1).filter((argument) => argument !== "--json")
  switch (command) {
    case "status":
    case "conflicts":
      if (commandArgs.length > 0) {
        throw new Error(`Graft ${command} does not accept repository arguments`)
      }
      return undefined
    case "fetch":
    case "pull":
    case "push":
      return serializeRemoteBranchArguments(command, commandArgs)
    case "branch-upstream":
      if (commandArgs.length !== 2) {
        throw new Error(
          "Graft branch-upstream requires a local branch and remote branch"
        )
      }
      return commandArgs
        .map((argument) =>
          requirePlainPragmaWord(argument, "Graft branch-upstream argument")
        )
        .join(" ")
    case "resolve":
      if (
        !commandArgs.some((argument) =>
          ["--ours", "--theirs", "--manual"].includes(argument)
        )
      ) {
        throw new Error("Graft resolve requires one resolution side")
      }
      if (commandArgs.some((argument) => argument.includes("\0"))) {
        throw new Error("Graft resolve arguments cannot contain NUL")
      }
      return commandArgs.join(" ")
    case "commit": {
      const messageIndex = commandArgs.findIndex(
        (argument) => argument === "-m" || argument === "--message"
      )
      const message =
        messageIndex >= 0 ? commandArgs[messageIndex + 1] : undefined
      if (!message) throw new Error("Graft commit requires a message")
      return message
    }
    case "merge-continue":
      if (commandArgs.length !== 1 || !commandArgs[0]) {
        throw new Error("Graft merge-continue requires a message")
      }
      return commandArgs[0]
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
    const command = args[0] as SupportedCommand | "remote" | undefined
    const commandArgs = args
      .slice(1)
      .filter((argument) => argument !== "--json")
    if (command === "remote") {
      const remote = remoteCommand(commandArgs)
      return this.executor.execute(
        repositoryPath,
        remote.pragma,
        remote.argument
      )
    }
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
