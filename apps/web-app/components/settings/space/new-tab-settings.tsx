import { useEffect, useState } from "react"
import type { IExtension } from "@/packages/core/types/IExtension"
import { detectDirective } from "@eidos.space/v3"
import {
  ExternalLinkIcon,
  LayoutTemplate,
  SquareMousePointer,
} from "lucide-react"

import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { closeSettings } from "@/components/settings/settings-events"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSqliteKV } from "@/apps/web-app/hooks/use-sqlite-kv"

export function NewTabSettings() {
  const { sqlite } = useSqlite()
  const { navigate } = useRouterAdapter()
  const [newTabBlocks, setNewTabBlocks] = useState<IExtension[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedBlockId, setSelectedBlockId] = useSqliteKV<string | null>(
    "eidos:space:settings:newtab",
    ""
  )

  // Load all blocks with "use newtab" directive
  useEffect(() => {
    if (!sqlite) return

    const loadNewTabBlocks = async () => {
      try {
        setIsLoading(true)
        const candidates = await sqlite.extension.findMany({
          where: {
            OR: [
              { code: { contains: '"use newtab"' } },
              { code: { contains: "'use newtab'" } },
            ],
          },
        })
        const blocks = (candidates as IExtension[]).filter(
          (ext) => ext.code && detectDirective(ext.code, "use newtab")
        )
        setNewTabBlocks(blocks)
      } catch (error) {
        console.error("Error loading new tab blocks:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadNewTabBlocks()
  }, [sqlite])

  const handleSelect = (value: string) => {
    setSelectedBlockId(value === "default" ? null : value)
  }

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading new tab options...
      </div>
    )
  }

  return (
    <div className="space-y-0">
      <div className="py-4">
        <h3 className="text-lg font-medium">New Tab Page</h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              Choose what happens when you open a new tab. You can use the
              default dashboard or select a custom block.
            </p>

            <RadioGroup
              value={selectedBlockId || "default"}
              onValueChange={handleSelect}
              className="space-y-4"
            >
              {/* Default Option */}
              <div
                className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => handleSelect("default")}
              >
                <RadioGroupItem value="default" id="default" className="mt-1" />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="default"
                    className="font-medium cursor-pointer"
                  >
                    Default Dashboard
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    The standard Eidos start page with shortcuts and recent
                    documents.
                  </p>
                </div>
                <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Custom Blocks */}
              {newTabBlocks.map((block) => (
                <div
                  key={block.id}
                  className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                >
                  <RadioGroupItem
                    value={block.id}
                    id={block.id}
                    className="mt-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelect(block.id)
                    }}
                  />
                  <div
                    className="flex-1 space-y-1"
                    onClick={() => handleSelect(block.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={block.id}
                        className="font-medium cursor-pointer"
                      >
                        {block.name || block.id}
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {block.description || "No description"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeSettings()
                        navigate(`/blocks/${block.id}`)
                      }}
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                    </Button>
                    <SquareMousePointer className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </RadioGroup>

            {newTabBlocks.length === 0 && (
              <div className="mt-6 text-sm text-muted-foreground bg-muted/30 p-4 rounded-md">
                No blocks with "use newtab" directive found. Add{" "}
                <code>"use newtab";</code> to the top of your block code to make
                it available here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
