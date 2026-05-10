/**
 * A simple argument parser for bash-style commands.
 * Supports positionals and --key value or --key=value flags.
 */
export function parseArgs(args: string[]) {
  const positionals: string[] = []
  const flags: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("--")) {
      if (arg.includes("=")) {
        const [key, ...valueParts] = arg.slice(2).split("=")
        flags[key] = valueParts.join("=")
      } else {
        const key = arg.slice(2)
        const nextArg = args[i + 1]
        if (nextArg && !nextArg.startsWith("--")) {
          flags[key] = nextArg
          i++ // skip next arg
        } else {
          flags[key] = "true"
        }
      }
    } else {
      positionals.push(arg)
    }
  }

  return { positionals, flags }
}
