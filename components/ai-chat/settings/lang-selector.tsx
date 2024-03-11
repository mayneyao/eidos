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

const AvailableLanguages = {
  en: "English",
  zh: "Chinese",
  de: "German",
  es: "Spanish",
  ru: "Russian",
  ko: "Korean",
  fr: "French",
  ja: "Japanese",
  pt: "Portuguese",
  tr: "Turkish",
  pl: "Polish",
  ca: "Catalan",
  nl: "Dutch",
  ar: "Arabic",
  sv: "Swedish",
  it: "Italian",
  id: "Indonesian",
  hi: "Hindi",
  fi: "Finnish",
  vi: "Vietnamese",
  he: "Hebrew",
  uk: "Ukrainian",
  el: "Greek",
  ms: "Malay",
  cs: "Czech",
  ro: "Romanian",
  da: "Danish",
  hu: "Hungarian",
  ta: "Tamil",
  no: "Norwegian",
  th: "Thai",
  ur: "Urdu",
  hr: "Croatian",
  bg: "Bulgarian",
  lt: "Lithuanian",
  la: "Latin",
  mi: "Maori",
  ml: "Malayalam",
  cy: "Welsh",
  sk: "Slovak",
  te: "Telugu",
  fa: "Persian",
  lv: "Latvian",
  bn: "Bengali",
  sr: "Serbian",
  az: "Azerbaijani",
  sl: "Slovenian",
  kn: "Kannada",
  et: "Estonian",
  mk: "Macedonian",
  br: "Breton",
  eu: "Basque",
  is: "Icelandic",
  hy: "Armenian",
  ne: "Nepali",
  mn: "Mongolian",
  bs: "Bosnian",
  kk: "Kazakh",
  sq: "Albanian",
  sw: "Swahili",
  gl: "Galician",
  mr: "Marathi",
  pa: "Punjabi",
  si: "Sinhala",
  km: "Khmer",
  sn: "Shona",
  yo: "Yoruba",
  so: "Somali",
  af: "Afrikaans",
  oc: "Occitan",
  ka: "Georgian",
  be: "Belarusian",
  tg: "Tajik",
  sd: "Sindhi",
  gu: "Gujarati",
  am: "Amharic",
  yi: "Yiddish",
  lo: "Lao",
  uz: "Uzbek",
  fo: "Faroese",
  ht: "Haitian creole",
  ps: "Pashto",
  tk: "Turkmen",
  nn: "Nynorsk",
  mt: "Maltese",
  sa: "Sanskrit",
  lb: "Luxembourgish",
  my: "Myanmar",
  bo: "Tibetan",
  tl: "Tagalog",
  mg: "Malagasy",
  as: "Assamese",
  tt: "Tatar",
  haw: "Hawaiian",
  ln: "Lingala",
  ha: "Hausa",
  ba: "Bashkir",
  jw: "Javanese",
  su: "Sundanese",
  yue: "Cantonese",
}

export function SourceLangSelector() {
  const { sourceLanguage: value, setSourceLanguage: setValue } =
    useAIChatSettingsStore()
  const [open, setOpen] = React.useState(false)
  const sourceLanguages = Object.entries(AvailableLanguages)
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
            ? sourceLanguages.find((lang) => lang[0] === value)?.[1]
            : "Select source language"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder="Search language..." />
          <CommandEmpty>No languages found</CommandEmpty>
          <ScrollArea>
            <CommandList className="max-h-[300px]">
              <CommandGroup>
                {sourceLanguages.map((lang) => (
                  <CommandItem
                    key={lang[1]}
                    value={lang[1]}
                    onSelect={(currentValue) => {
                      setValue(lang[0] === value ? "" : lang[0])
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === lang[0] ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {lang[1]}
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
