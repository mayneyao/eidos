import { Blocks, PanelsTopLeft } from "lucide-react"

import { filePathFromSpaceUrl } from "@/apps/web-app/components/file-space/file-path"
import type {
  FileExtensionCommand,
  FileExtensionPanel,
} from "@/apps/web-app/hooks/use-file-extension-commands"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import { useToast } from "@/components/ui/use-toast"

export function FileExtensionContributionItems({
  commands,
  panels,
  execute,
  openPanel,
  onExecute,
}: {
  commands: FileExtensionCommand[]
  panels: FileExtensionPanel[]
  execute: (
    command: FileExtensionCommand,
    resourcePath: string
  ) => Promise<unknown>
  openPanel: (panel: FileExtensionPanel) => Promise<unknown>
  onExecute: () => void
}) {
  const { location } = useRouterAdapter()
  const { toast } = useToast()
  if (commands.length === 0 && panels.length === 0) return null

  const resourcePath =
    filePathFromSpaceUrl(location.pathname + location.search + location.hash) ??
    ""

  return (
    <CommandGroup heading="Extensions">
      {commands.map((command) => (
        <CommandItem
          key={`${command.packageId}:${command.id}`}
          value={getFileExtensionCommandValue(command)}
          onSelect={() => {
            onExecute()
            void execute(command, resourcePath).catch((error) => {
              toast({
                title: command.title,
                description:
                  error instanceof Error
                    ? error.message
                    : "The extension command failed.",
                variant: "destructive",
              })
            })
          }}
        >
          <Blocks className="mr-2 h-4 w-4" />
          <div className="min-w-0 flex-1">
            <div className="truncate">{command.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {command.extensionDisplayName}
            </div>
          </div>
        </CommandItem>
      ))}
      {panels.map((panel) => (
        <CommandItem
          key={`${panel.packageId}:${panel.id}`}
          value={getFileExtensionPanelValue(panel)}
          onSelect={() => {
            onExecute()
            void openPanel(panel).catch((error) => {
              toast({
                title: panel.displayName,
                description:
                  error instanceof Error
                    ? error.message
                    : "The extension panel failed to open.",
                variant: "destructive",
              })
            })
          }}
        >
          <PanelsTopLeft className="mr-2 h-4 w-4" />
          <div className="min-w-0 flex-1">
            <div className="truncate">{panel.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {panel.extensionDisplayName} · Panel
            </div>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

export function getFileExtensionCommandValue(command: FileExtensionCommand) {
  return `${command.title} ${command.category ?? ""} ${command.extensionDisplayName}`
}

export function getFileExtensionPanelValue(panel: FileExtensionPanel) {
  return `${panel.displayName} Panel ${panel.extensionDisplayName}`
}
