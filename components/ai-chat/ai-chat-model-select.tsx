"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

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
import { useConfigStore } from "@/app/settings/store"

import { ScrollArea } from "../ui/scroll-area"
import { WEB_LLM_MODELS } from "./webllm/models"

const allLocalModels = WEB_LLM_MODELS.map((item) => `${item.model_id}`)

const useModels = () => {
  const { aiConfig } = useConfigStore()
  const [models, setModels] = React.useState<string[]>([])
  React.useEffect(() => {
    const openaiModels = aiConfig.OPENAI_MODELS.split(",").map(
      (item: string) => item.trim() + "@openai"
    )
    const groqModels = aiConfig.GROQ_MODELS.split(",").map(
      (item: string) => item.trim() + "@groq"
    )
    const googleModels = aiConfig.GOOGLE_MODELS.split(",").map(
      (item: string) => item.trim() + "@google"
    )
    setModels([...openaiModels, ...groqModels, ...googleModels])
  }, [aiConfig])

  return {
    models,
  }
}

export function AIModelSelect({
  value,
  onValueChange: setValue,
  onlyLocal,
  className,
  excludeLocalModels,
  localModels,
}: {
  onValueChange: (value: string) => void
  value: string
  onlyLocal?: boolean
  className?: string
  excludeLocalModels?: string[]
  localModels?: string[]
}) {
  const [open, setOpen] = React.useState(false)
  const { models } = useModels()

  const _allLocalModels = localModels || allLocalModels || []

  const allModels = onlyLocal ? _allLocalModels : [...models, ...allLocalModels]

  const _localModels = excludeLocalModels
    ? _allLocalModels.filter((model) => !excludeLocalModels.includes(model))
    : _allLocalModels

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[240px] justify-between ", className)}
        >
          <p className="w-[200px] truncate">
            {value
              ? allModels.find((model) => model === value)
              : "Select model..."}
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
                <CommandGroup heading="Service via API">
                  {models.map((model) => (
                    <CommandItem
                      key={model}
                      value={model}
                      onSelect={(currentValue) => {
                        setValue(currentValue === value ? "" : currentValue)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === model ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {model}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Local LLM">
                {_localModels.map((model) => (
                  <CommandItem
                    key={model}
                    value={model}
                    onSelect={(currentValue) => {
                      setValue(model === value ? "" : model)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === model ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {model}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
