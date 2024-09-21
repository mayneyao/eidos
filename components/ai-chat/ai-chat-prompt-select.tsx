import * as React from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { Check } from "lucide-react"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { ScrollArea } from "../ui/scroll-area"

export const AIChatPromptSelect = (props: {
  promptKeys: string[]
  prompts: IScript[]
  value: string
  className?: string
  onValueChange: (value: string) => void
}) => {
  const { space } = useCurrentPathInfo()
  const {
    prompts,
    value,
    onValueChange: setValue,
    promptKeys,
    className,
  } = props
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="xs"
          aria-expanded={open}
          className={cn("w-[100px] justify-between", className)}
        >
          <p className="w-[70px]  truncate">
            {value
              ? prompts.find((prompt) => prompt.id === value)?.name || value
              : "select prompt"}
          </p>
          {/* <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /> */}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search prompt..." />
          <ScrollArea>
            <div className="max-h-[300px]">
              <CommandEmpty>
                {" "}
                No Prompt found.
                <br />
                <Link to={`/${space}/extensions`} className="text-blue-500">
                  New Prompt
                </Link>
              </CommandEmpty>{" "}
              <CommandGroup heading="built-in">
                {promptKeys.map((key) => {
                  return (
                    <TooltipProvider key={key}>
                      <Tooltip>
                        <TooltipTrigger className="text-left">
                          <CommandItem
                            key={key}
                            value={key}
                            onSelect={() => {
                              setValue(key === value ? "" : key)
                              setOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                value === key ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <p className="w-[150px] truncate">{key}</p>
                          </CommandItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[24rem]">
                          <p>
                            built-in system prompt, too complex to show here 😅
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                })}
              </CommandGroup>
              <CommandGroup heading="custom">
                {prompts.map((prompt) => (
                  <TooltipProvider key={prompt.id}>
                    <Tooltip>
                      <TooltipTrigger className="text-left">
                        <CommandItem
                          key={prompt.id}
                          value={prompt.name}
                          onSelect={() => {
                            setValue(prompt.id === value ? "" : prompt.id)
                            setOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              value === prompt.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <p className="w-[150px] truncate">{prompt.name}</p>
                        </CommandItem>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[24rem]">
                        <p>{prompt.code}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {Boolean(prompts?.length === 0) && (
                  <p className="ml-8 text-xs text-gray-500">
                    No custom prompt found.
                    <br />
                    <Link to={`/${space}/extensions`} className="text-blue-500">
                      New Prompt
                    </Link>
                  </p>
                )}
              </CommandGroup>
            </div>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
