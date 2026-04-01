"use client"

import { useState } from "react"
import { Play, Terminal, Trash2 } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { useTabTitle } from "@/hooks/use-tab-title"

const DEFAULT_YAML = `site: weread
name: shelf
description: List books on your WeRead bookshelf
domain: weread.qq.com
strategy: cookie
browser: true

args:
  limit: 20

pipeline:
  - type: navigate
    url: https://weread.qq.com
    settleMs: 3000

  - type: evaluate
    script: |
      const limit = \${{ args.limit }} || 20;
      const res = await fetch('/web/shelf/sync?synckey=0&lectureSynckey=0', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data?.errCode === -2010) throw new Error('Not logged in to WeRead');
      const books = data?.books || [];
      const progress = data?.bookProgress || [];
      const progressMap = {};
      progress.forEach(p => { progressMap[p.bookId] = p.progress; });
      return books.slice(0, limit).map(item => ({
        title: item.title || '',
        author: item.author || '',
        cover: item.cover || '',
        progress: progressMap[item.bookId] != null ? progressMap[item.bookId] + '%' : '-',
        bookId: item.bookId || '',
      }));
`

function parseYamlLikeInput(input: string): {
  steps: any[]
  args: Record<string, any>
} {
  try {
    const json = JSON.parse(input)
    return { steps: json.pipeline || json.steps || [], args: json.args || {} }
  } catch {
    const lines = input.split("\n")
    return { steps: parsePipeline(lines), args: parseArgs(lines) }
  }
}

function parseArgs(lines: string[]): Record<string, any> {
  const args: Record<string, any> = {}
  let inArgs = false
  let argsBaseIndent = 0
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === "args:") {
      inArgs = true
      argsBaseIndent = line.search(/\S/)
      i++
      continue
    }
    if (!inArgs) {
      i++
      continue
    }
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++
      continue
    }

    const indent = line.search(/\S/)
    if (indent <= argsBaseIndent && trimmed.endsWith(":")) {
      inArgs = false
      continue
    }

    const match = line.match(/^(\s+)(\w+):\s*(.*)$/)
    if (match) {
      const key = match[2]
      const val = match[3].trim()
      const keyIndent = match[1].length

      if (val === "") {
        const nested: Record<string, any> = {}
        i++
        while (i < lines.length) {
          const next = lines[i]
          if (next.trim() === "") {
            i++
            continue
          }
          const ni = next.search(/\S/)
          if (ni <= keyIndent) break
          const nm = next.match(/^\s+(\w+):\s*(.*)$/)
          if (nm) {
            const v = nm[2].trim()
            nested[nm[1]] = isNaN(Number(v)) ? v : Number(v)
          }
          i++
        }
        args[key] = nested.default !== undefined ? nested.default : nested
        continue
      } else {
        args[key] = isNaN(Number(val)) ? val : Number(val)
      }
    }
    i++
  }

  return args
}

function parsePipeline(lines: string[]): any[] {
  const steps: any[] = []
  let inPipeline = false
  let pipelineBaseIndent = 0
  let currentBlock: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "pipeline:") {
      inPipeline = true
      pipelineBaseIndent = line.search(/\S/)
      continue
    }
    if (!inPipeline) continue
    if (trimmed === "" || trimmed.startsWith("#")) {
      if (currentBlock.length) currentBlock.push(line)
      continue
    }

    const indent = line.search(/\S/)
    const isNewItem = /^\s*-\s+/.test(line)

    if (isNewItem) {
      if (currentBlock.length) steps.push(parseStep(currentBlock))
      currentBlock = [line]
    } else if (currentBlock.length) {
      if (indent > pipelineBaseIndent) {
        currentBlock.push(line)
      } else {
        inPipeline = false
      }
    }
  }

  if (currentBlock.length) steps.push(parseStep(currentBlock))
  return steps
}

function parseStep(lines: string[]): any {
  const first = lines[0]
  const m = first.match(/^\s*-\s+(\w+):\s*(.*)$/)
  if (!m) return { type: "unknown" }

  const type = m[1]
  const remainder = m[2].trim()
  const step: any = { type }

  if (type === "type") {
    step.type = remainder
    parsePropertiesSmart(lines.slice(1)).forEach(([k, v]) => (step[k] = v))
    return step
  }

  if (remainder === "|") {
    const key = type === "evaluate" ? "script" : "value"
    step[key] = extractMultiline(lines.slice(1))
    return step
  }

  if (remainder === "") {
    parsePropertiesSmart(lines.slice(1)).forEach(([k, v]) => (step[k] = v))
    return step
  }

  if (type === "evaluate") step.script = remainder
  else if (type === "wait") step.ms = Number(remainder) || 0
  else step.value = remainder

  return step
}

function extractMultiline(lines: string[]): string {
  let baseIndent = Infinity
  for (const line of lines) {
    if (line.trim() === "") continue
    const indent = line.search(/\S/)
    if (indent < baseIndent) baseIndent = indent
  }
  if (baseIndent === Infinity) return ""

  const out: string[] = []
  for (const line of lines) {
    if (line.trim() === "") {
      out.push("")
      continue
    }
    const indent = line.search(/\S/)
    if (indent < baseIndent) break
    out.push(line.slice(baseIndent))
  }
  return out.join("\n")
}

function parsePropertiesSmart(lines: string[]): [string, any][] {
  let minIndent = Infinity
  for (const line of lines) {
    if (line.trim() === "") continue
    const indent = line.search(/\S/)
    if (indent < minIndent) minIndent = indent
  }
  if (minIndent === Infinity) return []

  const props: [string, any][] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "") {
      i++
      continue
    }
    const indent = line.search(/\S/)
    if (indent < minIndent) break

    const match = line.match(/^(\s+)(\w+):\s*(.*)$/)
    if (!match) {
      i++
      continue
    }

    const key = match[2]
    let val = match[3].trim()

    if (val === "|") {
      const contentBase = line.search(/\S/) + 2
      const contentLines: string[] = []
      i++
      while (i < lines.length) {
        const next = lines[i]
        if (next.trim() === "") {
          contentLines.push("")
          i++
          continue
        }
        if (next.search(/\S/) < contentBase) break
        contentLines.push(next.slice(contentBase))
        i++
      }
      props.push([key, contentLines.join("\n")])
    } else {
      if (key === "settleMs" || key === "ms") val = Number(val) as any
      props.push([key, val])
      i++
    }
  }
  return props
}

export default function PipelinePage() {
  useTabTitle("Pipeline Runner")
  const { toast } = useToast()
  const [input, setInput] = useState(DEFAULT_YAML)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [rendererLogs, setRendererLogs] = useState<string[]>([])
  const [debug, setDebug] = useState(false)

  const handleRun = async () => {
    if (!isDesktopMode) {
      toast({
        title: "Desktop only",
        description: "Pipeline runner requires Electron desktop app.",
        variant: "destructive",
      })
      return
    }

    setRunning(true)
    setResult(null)
    setLogs([])
    setRendererLogs([])

    try {
      const { steps, args } = parseYamlLikeInput(input)
      const res = await window.eidos.pipeline.run(steps, args, { debug })
      if (res.success) {
        setResult(res.result)
        setLogs(res.logs || [])
        setRendererLogs(res.rendererLogs || [])
        toast({
          title: "Pipeline finished",
          description: `${res.logs?.length || 0} steps executed`,
        })
      } else {
        toast({
          title: "Pipeline failed",
          description: res.error || "Unknown error",
          variant: "destructive",
        })
        setLogs(res.logs || [])
        setRendererLogs(res.rendererLogs || [])
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pipeline Runner</h1>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => setDebug(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-muted-foreground"
            />
            Debug (DevTools)
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setInput("")
              setResult(null)
              setLogs([])
              setRendererLogs([])
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Clear
          </Button>
          <Button size="sm" onClick={handleRun} disabled={running}>
            {running ? (
              <span className="mr-1 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            Run
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Pipeline YAML / JSON
          </label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 font-mono text-sm"
            placeholder="Paste pipeline config here..."
          />
        </div>

        <div className="flex flex-col gap-4 overflow-auto">
          {result !== null && (
            <div className="rounded-md border bg-muted/30 p-3">
              <h2 className="mb-2 text-sm font-medium">Result</h2>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {(logs.length > 0 || rendererLogs.length > 0) && (
            <div className="flex flex-1 flex-col rounded-md border bg-muted/30 p-3">
              <h2 className="mb-2 flex items-center text-sm font-medium">
                <Terminal className="mr-1 h-4 w-4" />
                Logs
              </h2>
              <div className="flex-1 overflow-auto font-mono text-xs space-y-1">
                {logs.map((log, i) => (
                  <div
                    key={`m-${i}`}
                    className="border-b border-border/50 py-1 last:border-0"
                  >
                    {log}
                  </div>
                ))}
                {rendererLogs.map((log, i) => (
                  <div
                    key={`r-${i}`}
                    className={`border-b border-border/50 py-1 last:border-0 ${
                      log.includes("[renderer:error]")
                        ? "text-red-500"
                        : "text-blue-500"
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
