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
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

import { useAIChatSettingsStore } from "./ai-chat-settings-store"

export function VoiceSelector() {
  const { voiceURI: value, setVoiceURI: setValue } = useAIChatSettingsStore()
  const [open, setOpen] = React.useState(false)
  const synth = window.speechSynthesis
  const voices = synth.getVoices()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[250px] justify-between"
        >
          {value
            ? voices.find((voice) => voice.voiceURI === value)?.name
            : "Select voice..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder="Search voice..." />
          <CommandEmpty>No voice found.</CommandEmpty>
          <ScrollArea>
            <CommandList className="max-h-[300px]">
              <CommandGroup>
                {voices.map((voice) => (
                  <CommandItem
                    key={voice.voiceURI}
                    value={voice.voiceURI}
                    onSelect={(currentValue) => {
                      setValue(currentValue === value ? "" : voice.voiceURI)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === voice.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {voice.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
