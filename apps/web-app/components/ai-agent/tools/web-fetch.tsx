import React from "react"
import { type WebFetchResult } from "@/packages/ai"
import { type ToolUIConfig } from "./types"

function WebFetchOutputView({
  data,
  args,
}: {
  data: WebFetchResult | null | undefined
  args: { Url?: string; url?: string } | null | undefined
}) {
  const title = data?.title || ""
  const url = data?.url || args?.Url || args?.url || ""

  return (
    <div className="flex flex-col gap-1 mt-1.5 select-text">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[12.5px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 leading-snug w-fit"
        >
          {title || url}
        </a>
      ) : (
        <span className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
          {title || "No Title"}
        </span>
      )}
      {title && url && (
        <span className="text-[11.5px] text-zinc-400 dark:text-zinc-500 truncate max-w-[400px]">
          {url}
        </span>
      )}
    </div>
  )
}

export const webFetchConfig: ToolUIConfig = {
  displayName: "Web Fetch",
  subtitle: (args) => args?.url || args?.Url || "",
  renderOutput: (data, args) => <WebFetchOutputView data={data} args={args} />,
}
