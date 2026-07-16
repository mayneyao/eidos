const REPOSITORY_PRAGMAS = {
  add: "graft_json_add",
  diff: "graft_json_diff",
  restore: "graft_json_restore",
  status: "graft_json_status",
}

function quotePragmaWord(value) {
  if (value.includes("\0")) {
    throw new Error("Graft smoke arguments cannot contain NUL")
  }
  return `"${value.replace(/(["\\])/g, "\\$1")}"`
}

function serializeArguments(args) {
  if (args.length === 0) return undefined
  return args
    .map((argument) =>
      argument === "--" || argument.startsWith("--")
        ? argument
        : quotePragmaWord(argument)
    )
    .join(" ")
}

function commandArguments(args) {
  return args.slice(1).filter((argument) => argument !== "--json")
}

function requiredArgument(value, command) {
  if (!value) throw new Error(`Graft ${command} requires an argument`)
  if (value.includes("\0") || /\s/.test(value)) {
    throw new Error(`Graft ${command} requires one plain argument`)
  }
  return value
}

function graftSmokeCommand(args) {
  const command = args[0]
  const values = commandArguments(args)

  if (command === "init") {
    return { transport: "cli", args: [...args] }
  }
  if (command === "clone") {
    return {
      transport: "clone",
      pragma: "graft_json_clone",
      argument: values
        .map((value) => requiredArgument(value, command))
        .join(" "),
    }
  }
  if (command === "commit") {
    const messageIndex = values.findIndex(
      (value) => value === "-m" || value === "--message"
    )
    const message = messageIndex >= 0 ? values[messageIndex + 1] : undefined
    if (!message) throw new Error("Graft commit requires a message")
    return {
      transport: "repository",
      pragma: "graft_json_commit",
      argument: message,
    }
  }
  if (command === "log") {
    const pagination = serializeArguments(values)
    return {
      transport: "repository",
      pragma: "graft_json_log",
      argument: pagination ? `--with-status ${pagination}` : "--with-status",
    }
  }
  if (command === "ls-files") {
    return {
      transport: "repository",
      pragma: "graft_json_ls_files",
      argument: serializeArguments(values),
    }
  }
  if (command === "show") {
    return {
      transport: "repository",
      pragma: "graft_json_show",
      argument: values.find((value) => value !== "--"),
    }
  }
  if (command === "branch") {
    return {
      transport: "repository",
      pragma:
        values.length === 0 ? "graft_json_branch" : "graft_json_branch_create",
      ...(values.length === 0
        ? {}
        : { argument: requiredArgument(values[0], command) }),
    }
  }
  if (command === "switch" || command === "merge") {
    return {
      transport: "repository",
      pragma:
        command === "switch" ? "graft_json_switch_branch" : "graft_json_merge",
      argument: requiredArgument(values[0], command),
    }
  }
  if (command in REPOSITORY_PRAGMAS) {
    const argument = serializeArguments(values)
    return {
      transport: "repository",
      pragma: REPOSITORY_PRAGMAS[command],
      ...(argument === undefined ? {} : { argument }),
    }
  }

  throw new Error(`Unsupported Graft smoke command: ${command ?? "<empty>"}`)
}

module.exports = { graftSmokeCommand }
