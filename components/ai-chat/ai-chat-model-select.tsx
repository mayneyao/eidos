"use client"

import { Check, ChevronsUpDown } from "lucide-react"
import * as React from "react"

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
import { cn } from "@/lib/utils"

import { ScrollArea } from "../ui/scroll-area"
import { useInitWebLLMWorker } from "./webllm/hooks"
import { WEB_LLM_MODELS } from "./webllm/models"

const models = [
  "gpt-3.5-turbo-1106@openai",
  "gpt-4-1106-preview@openai",
  "gpt-4-vision-preview@openai",
  "mixtral-8x7b-32768@groq",
  "llama2-70b-4096@groq",
  "gemini-pro@google",
]

const localModels = WEB_LLM_MODELS.map((item) => `${item.local_id}`)

const allModels = [...models, ...localModels]

export function AIModelSelect({
  value,
  onValueChange: setValue,
}: {
  onValueChange: (value: string) => void
  value: string
}) {
  const [open, setOpen] = React.useState(false)
  const { reload } = useInitWebLLMWorker()
  React.useEffect(() => {
    const isLocal = localModels.includes(value)
    const localLLM = WEB_LLM_MODELS.find((item) => item.local_id === value)
    if (isLocal && localLLM) {
      reload(localLLM.local_id)
    }
  }, [reload, value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[300px] justify-between"
        >
          {value
            ? allModels.find((model) => model === value)
            : "Select model..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search model..." />
          <CommandEmpty>No model found.</CommandEmpty>
          <ScrollArea className="w-[350px]">
            <div className="max-h-[500px]">
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
              <CommandGroup heading="Local LLM">
                {localModels.map((model) => (
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
