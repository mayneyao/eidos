import type { Bash } from "@eidos.space/bashkit"
import { extractCommandNames, findFirstCommand, wordText } from "./ast-parser"
import type { AstScript } from "./ast-parser"

/** Return the precise permission key for an eidos command, or null if read-only. */
function eidosCategory(args: string[]): string | null {
  if (args.length < 2) return null
  const [cmd, sub] = args.slice(1)
  if (cmd === "record" && sub && sub !== "query") return `eidos:record:${sub}`
  if (cmd === "subdoc" && (sub === "write" || sub === "delete"))
    return `eidos:subdoc:${sub}`
  if (cmd === "table" && (sub === "create" || sub === "delete"))
    return `eidos:table:${sub}`
  if (cmd === "column" && sub) return `eidos:column:${sub}`
  if (cmd === "view" && sub && sub !== "list") return `eidos:view:${sub}`
  if (cmd === "journal" && sub === "write") return `eidos:journal:${sub}`
  if (cmd === "extension" && (sub === "create" || sub === "write"))
    return `eidos:extension:${sub}`
  if (cmd === "doc" && sub && sub !== "get") return `eidos:doc:${sub}`
  return null
}

const safeCommands = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "rg",
  "grep",
  "find",
  "wc",
  "sort",
  "cd",
  "pwd",
  "echo",
  "printf",
  "jq",
  "awk",
  "sed",
  "sleep",
  "which",
  "file",
  "stat",
  "basename",
  "dirname",
  "true",
  "false",
  "clear",
  "date",
  "hostname",
  "whoami",
  "uname",
  "help",
  "history",
  "web-fetch",
  "web-search",
])

export function createBashPermissionRule(
  bash: Bash
): (input: any) => string | false {
  return (input: any) => {
    const cmd = (input?.command ?? "") as string
    if (!cmd.trim()) return false

    let names: string[] = []
    let eidosArgs: string[] = []
    try {
      const raw = bash.parse(cmd)
      const ast: AstScript = typeof raw === "string" ? JSON.parse(raw) : raw
      names = extractCommandNames(ast)
      const simple = findFirstCommand(ast, "eidos")
      if (simple) {
        eidosArgs = ["eidos", ...simple.args.map(wordText)]
      }
    } catch {
      return "bash"
    }

    for (const name of names) {
      if (safeCommands.has(name)) continue

      if (name === "eidos") {
        const key = eidosCategory(eidosArgs)
        if (!key) continue
        return `bash:${key}`
      }

      return `bash:${name}`
    }
    return false
  }
}
