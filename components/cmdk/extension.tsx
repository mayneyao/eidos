import { Database } from "lucide-react"

import { useExtensions } from "@/app/extensions/hooks/use-extensions"

import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "../ui/command"

export const ExtensionCommandItems = () => {
  const { extensions } = useExtensions()

  const openExtension = (name: string) => {
    window.open(`/ext/${name}`)
  }
  return (
    <>
      {Boolean(extensions.length) && (
        <>
          <CommandGroup heading="Extensions">
            {extensions.map((extension) => (
              <CommandItem
                key={extension.name}
                onSelect={() => openExtension(extension.name)}
                value={extension.name}
              >
                <Database className="mr-2 h-4 w-4" />
                <span>{extension.name}</span>
                <CommandShortcut>Jump to</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
        </>
      )}
    </>
  )
}
