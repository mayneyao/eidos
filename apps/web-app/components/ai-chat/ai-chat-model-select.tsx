"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Link } from "react-router-dom"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAIConfigStore } from "@/components/settings/stores"

import { ScrollArea } from "../ui/scroll-area"

const allLocalModels: string[] = []

const useModels = () => {
  const { aiConfig } = useAIConfigStore()
  const [models, setModels] = React.useState<string[]>([])
  React.useEffect(() => {
    const allModels = aiConfig.llmProviders
      .filter((item) => item.enabled)
      .map((item) => {
        return item.models.split(",").map((model) => {
          return `${model.trim()}@${item.name}`
        })
      })
      .flat()
    setModels(allModels)
  }, [aiConfig])

  return {
    models,
  }
}

export function AIModelSelect({
  value,
  onValueChange: setValue,
  onlyLocal,
  size = "default",
  className,
  excludeLocalModels,
  localModels,
  noBorder,
}: {
  onValueChange: (value: string) => void
  value: string
  size?: "xs" | "sm" | "lg" | "default" | null | undefined
  onlyLocal?: boolean
  className?: string
  excludeLocalModels?: string[]
  localModels?: string[]
  noBorder?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const { models } = useModels()

  const _allLocalModels = localModels || allLocalModels || []

  const allModels = onlyLocal ? _allLocalModels : [...models, ...allLocalModels]

  const _localModels = excludeLocalModels
    ? _allLocalModels.filter((model) => !excludeLocalModels.includes(model))
    : _allLocalModels

  const currentModel = allModels.find(
    (model) => model.toLowerCase() === value.toLowerCase()
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={noBorder ? "ghost" : "outline"}
          role="combobox"
          aria-expanded={open}
          size={size}
          className={cn("w-full gap-1 min-w-0 overflow-hidden", className)}
        >
          <p
            className="flex-1 min-w-0 truncate text-left"
            title={currentModel || "Select model..."}
          >
            {value ? currentModel : "Select model..."}
          </p>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search model..." />
          <CommandEmpty>No model found.</CommandEmpty>
          <ScrollArea className="w-[350px]">
            <div className="max-h-[500px]">
              {!onlyLocal && (
                <CommandGroup>
                  {models.map((model) => (
                    <CommandItem
                      key={model}
                      value={model}
                      onSelect={(model) => {
                        setValue(
                          model.toLowerCase() === value.toLowerCase()
                            ? ""
                            : model
                        )
                        setOpen(false)
                      }}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          value.toLowerCase() === model.toLowerCase()
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <p className="flex-1 min-w-0 truncate" title={model}>
                        {model}
                      </p>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!isDesktopMode && (
                <CommandGroup heading="Local LLM">
                  {Boolean(!_localModels?.length) && (
                    <p className="ml-8 text-xs text-gray-500">
                      No local model found.
                      <br />
                      Add some models in the{" "}
                      <Link to="/settings/ai" className=" text-blue-500">
                        settings
                      </Link>{" "}
                      page.
                    </p>
                  )}
                  {_localModels.map((model) => (
                    <CommandItem
                      key={model}
                      value={model}
                      onSelect={(currentValue) => {
                        setValue(model === value ? "" : model)
                        setOpen(false)
                      }}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          value === model ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <p className="flex-1 min-w-0 truncate" title={model}>
                        {model}
                      </p>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </div>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
