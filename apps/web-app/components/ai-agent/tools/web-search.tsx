import React from "react"
import { type WebSearchItem } from "@/packages/ai"
import { type ToolUIConfig } from "./types"

function WebSearchOutputView({ data }: { data: unknown }) {
  let items: WebSearchItem[] = []

  if (Array.isArray(data)) {
    items = data as WebSearchItem[]
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.results)) {
      items = obj.results as WebSearchItem[]
    } else {
      const inner = obj.output ?? obj.response
      if (Array.isArray(inner)) {
        items = inner as WebSearchItem[]
      } else if (
        inner &&
        typeof inner === "object" &&
        Array.isArray((inner as Record<string, unknown>).results)
      ) {
        items = (inner as Record<string, unknown>).results as WebSearchItem[]
      }
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-zinc-400 dark:text-zinc-500 italic text-[12px] mt-1">
        No search results found
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 mt-1.5">
      {items.map((item, idx) => {
        const title = item.title || "Untitled"
        const url = item.url
        const snippet = item.snippet || ""
        return (
          <div key={idx} className="flex flex-col gap-0.5 select-text">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-[12.5px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 leading-snug w-fit"
              >
                {title}
              </a>
            ) : (
              <span className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
                {title}
              </span>
            )}
            {snippet && (
              <p className="text-[11.5px] text-zinc-500/90 dark:text-zinc-400/90 line-clamp-2 leading-normal">
                {snippet}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export const webSearchConfig: ToolUIConfig = {
  displayName: "Web Search",
  subtitle: (args) => args?.query || "",
  renderOutput: (data) => <WebSearchOutputView data={data} />,
}
