import React from "react"
import { type ToolUIConfig } from "./types"
import { WebFetchOutputView } from "./web-fetch"
import { WebSearchOutputView } from "./web-search"

type WebCommand =
  | { type: "web-fetch"; url: string }
  | { type: "web-search"; query: string }
  | null

function detectWebCommand(command: string): WebCommand {
  if (!command) return null
  const trimmed = command.trim()
  if (trimmed.startsWith("web-fetch ")) {
    const rest = trimmed.slice("web-fetch ".length)
    const url = rest
      .split(/\s*[>|]/)[0]
      .replace(/^['"]|['"]$/g, "")
      .trim()
    if (url) return { type: "web-fetch", url }
  }
  if (trimmed.startsWith("web-search ")) {
    const rest = trimmed.slice("web-search ".length)
    const query = rest
      .split(/\s*[>|]/)[0]
      .replace(/^['"]|['"]$/g, "")
      .trim()
    if (query) return { type: "web-search", query }
  }
  return null
}

function extractRedirectPath(command: string): string | undefined {
  const match = command.match(/>\s*(\/[^\s|;]+)/)
  return match ? match[1].trim() : undefined
}

function BashOutputView({ data, args }: { data: any; args: any }) {
  const command = args?.command || ""
  const webCmd = detectWebCommand(command)

  if (webCmd?.type === "web-fetch") {
    const stdoutContent = data?.stdout
    const hasRedirect = !!extractRedirectPath(command)
    if (hasRedirect && !stdoutContent) {
      return (
        <div className="flex flex-col gap-1 mt-1.5 select-text">
          <WebFetchOutputView
            data={null}
            args={{ url: webCmd.url, savedTo: extractRedirectPath(command) }}
          />
        </div>
      )
    }
    if (stdoutContent) {
      return (
        <div className="flex flex-col gap-1 mt-1.5 select-text">
          <WebFetchOutputView
            data={{ title: "", url: webCmd.url, content: stdoutContent }}
            args={{ url: webCmd.url }}
          />
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1 mt-1.5 select-text">
        <WebFetchOutputView data={null} args={{ url: webCmd.url }} />
      </div>
    )
  }

  if (webCmd?.type === "web-search") {
    const stdoutContent = data?.stdout
    if (stdoutContent) {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(stdoutContent)
      } catch {}
      return <WebSearchOutputView data={parsed} />
    }
    return null
  }

  let outputText = ""
  if (typeof data === "string") {
    outputText = data
  } else if (data && typeof data === "object") {
    if ("stdout" in data || "stderr" in data) {
      outputText = [data.stdout, data.stderr].filter(Boolean).join("\n")
    } else if ("output" in data) {
      outputText = String(data.output)
    } else if ("result" in data) {
      outputText = String(data.result)
    } else {
      outputText = JSON.stringify(data, null, 2)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 mt-1.5 select-text">
      {outputText && (
        <div className="text-zinc-600 dark:text-zinc-300 bg-zinc-100/60 dark:bg-zinc-800/60 p-2 rounded-lg border border-zinc-200/40 dark:border-zinc-800/40 text-[12px] font-mono leading-relaxed max-h-[320px] overflow-auto whitespace-pre-wrap select-text">
          {outputText}
        </div>
      )}
    </div>
  )
}

export const bashConfig: ToolUIConfig = {
  displayName: (args) => {
    const webCmd = detectWebCommand(args?.command || "")
    if (webCmd?.type === "web-fetch") return "Web Fetch"
    if (webCmd?.type === "web-search") return "Web Search"
    return "Bash"
  },
  subtitle: (args) => {
    const command = args?.command || ""
    const webCmd = detectWebCommand(command)
    if (webCmd?.type === "web-fetch") return webCmd.url
    if (webCmd?.type === "web-search") return webCmd.query
    return command
  },
  renderOutput: (data, args) => <BashOutputView data={data} args={args} />,
}
