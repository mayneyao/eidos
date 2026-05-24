"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { useAIConfigStore } from "@/components/settings/stores"

const useModelsByProvider = () => {
  const { aiConfig } = useAIConfigStore()

  return React.useMemo(() => {
    const providerMap = new Map<string, string[]>()

    aiConfig.llmProviders
      .filter((item) => item.enabled)
      .forEach((provider) => {
        const models = provider.models
          .split(",")
          .map((m) => m.trim())
          .filter((m) => m.length > 0)
        if (models.length > 0) {
          providerMap.set(provider.name, models)
        }
      })

    return providerMap
  }, [aiConfig])
}

export function AIModelSelect({
  value,
  onValueChange: setValue,
  className,
  noBorder,
  size,
}: {
  onValueChange: (value: string) => void
  value: string
  className?: string
  noBorder?: boolean
  size?: "xs" | "sm" | "default"
}) {
  const modelsByProvider = useModelsByProvider()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(e.target.value)
  }

  const sizeClasses = {
    xs: "h-7 text-sm px-2 pr-6",
    sm: "h-8 text-xs px-2.5 pr-7",
    default: "h-7 text-sm px-3 pr-8",
  }

  const iconSizes = {
    xs: "h-3.5 w-3.5 right-1.5",
    sm: "h-4 w-4 right-2",
    default: "h-3.5 w-3.5 right-2",
  }

  return (
    <div
      className={cn("relative", className)}
      style={{ width: size === "xs" ? "auto" : "180px" }}
    >
      <select
        value={value}
        onChange={handleChange}
        className={cn(
          "w-full appearance-none cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md",
          sizeClasses[size || "default"],
          noBorder
            ? "bg-transparent border-0 hover:bg-accent/50"
            : "bg-background border"
        )}
        style={{
          WebkitAppearance: "none",
          MozAppearance: "none",
        }}
      >
        <option value="">Select model...</option>

        {Array.from(modelsByProvider.entries()).map(([provider, models]) => (
          <optgroup key={provider} label={provider}>
            {models.map((model) => (
              <option
                key={`${model}@${provider}`}
                value={`${model}@${provider}`}
              >
                {model}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <ChevronDown
        className={cn(
          "absolute top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground",
          iconSizes[size || "default"]
        )}
      />
    </div>
  )
}
