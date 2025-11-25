import { useState, type Dispatch, type SetStateAction } from "react"
import { BookOpenTextIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"

import type { UIBlock } from "./block"
import { DocumentToolResult } from "./document"
import { Weather } from "./weather"

interface ToolCallResultProps {
  toolName: string
  toolCallId: string
  args: Record<string, any>
  result: any
  block: UIBlock
  setBlock: Dispatch<SetStateAction<UIBlock>>
}

export const ToolCallResult = ({
  toolName,
  toolCallId,
  args,
  result,
  block,
  setBlock,
}: ToolCallResultProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Special tool handling
  if (toolName === "createDoc") {
    return (
      <div className="flex flex-col">
        <div className="flex flex-col p-2 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800/50">
          <div className="flex items-center gap-2">
            <div className="relative size-5 shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full" />
              <div className="absolute inset-[1px] bg-background rounded-full flex items-center justify-center">
                <BookOpenTextIcon
                  size={10}
                  className="text-green-600 dark:text-green-400"
                />
              </div>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  📄 {toolName}
                </span>
                <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                  Created
                </span>
              </div>
              <Link
                to={result}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-0.5"
              >
                <BookOpenTextIcon size={10} />
                {args.title}
              </Link>
            </div>
          </div>
          {args && Object.keys(args).length > 0 && (
            <div className="mt-2 pt-2 border-t border-green-200/50 dark:border-green-800/30">
              <div className="text-xs text-muted-foreground/70">
                <div className="font-medium mb-1.5">Arguments:</div>
                <div className="space-y-1">
                  {Object.entries(args).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground/90">{key}:</span>
                      <span className="text-muted-foreground">
                        {JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (toolName === "getWeather") {
    return (
      <div className="flex flex-col">
        <div className="flex flex-col p-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800/50">
          <div className="flex items-center gap-2">
            <div className="relative size-5 shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full" />
              <div className="absolute inset-[1px] bg-background rounded-full flex items-center justify-center">
                <span className="text-xs">🌤️</span>
              </div>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  🌤️ {toolName}
                </span>
                <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                  Retrieved
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2">
            <Weather weatherAtLocation={result} />
          </div>
          {args && Object.keys(args).length > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200/50 dark:border-blue-800/30">
              <div className="text-xs text-muted-foreground/70">
                <div className="font-medium mb-1.5">Arguments:</div>
                <div className="space-y-1">
                  {Object.entries(args).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground/90">{key}:</span>
                      <span className="text-muted-foreground">
                        {JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (
    toolName === "createDocument" ||
    toolName === "updateDocument" ||
    toolName === "requestSuggestions"
  ) {
    const type =
      toolName === "createDocument"
        ? "create"
        : toolName === "updateDocument"
          ? "update"
          : "request-suggestions"
    return (
      <div className="flex flex-col">
        <div className="flex flex-col p-2 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800/50">
          <div className="flex items-center gap-2">
            <div className="relative size-5 shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full" />
              <div className="absolute inset-[1px] bg-background rounded-full flex items-center justify-center">
                <span className="text-xs">📝</span>
              </div>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  📝 {toolName}
                </span>
                <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full">
                  {type === "create"
                    ? "Created"
                    : type === "update"
                      ? "Updated"
                      : "Requested"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2">
            <DocumentToolResult
              type={type}
              result={result}
              block={block}
              setBlock={setBlock}
            />
          </div>
          {args && Object.keys(args).length > 0 && (
            <div className="mt-2 pt-2 border-t border-purple-200/50 dark:border-purple-800/30">
              <div className="text-xs text-muted-foreground/70">
                <div className="font-medium mb-1.5">Arguments:</div>
                <div className="space-y-1">
                  {Object.entries(args).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground/90">{key}:</span>
                      <span className="text-muted-foreground">
                        {JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // General tool result handling
  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-2 bg-muted/30 rounded-lg border border-border/50">
        <div className="flex items-center gap-2">
          <div className="relative size-5 shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full" />
            <div className="absolute inset-[1px] bg-background rounded-full flex items-center justify-center">
              <span className="text-xs">🔧</span>
            </div>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {toolName}
              </span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                Completed
              </span>
            </div>
          </div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        </div>

        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="text-xs text-muted-foreground/70">
              <div className="font-medium mb-1.5">Arguments:</div>
              <div className="space-y-1">
                {Object.entries(args).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/90">{key}:</span>
                    <span className="text-muted-foreground">
                      {typeof value === "string"
                        ? value
                        : JSON.stringify(value, null, 2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="font-medium mt-3 mb-1.5">Result:</div>
              <pre className="whitespace-pre-wrap break-words overflow-wrap-anywhere text-muted-foreground">
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
