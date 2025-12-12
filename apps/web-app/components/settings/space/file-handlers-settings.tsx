import { useEffect, useState } from "react"
import {
  BlockExtensionType,
  type FileHandlerMeta,
  type IExtension,
} from "@/packages/core/types/IExtension"
import { ExternalLinkIcon, FileIcon, TrashIcon } from "lucide-react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { useSqlite } from "@/hooks/use-sqlite"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { closeSettings } from "@/components/settings/settings-events"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

interface FileTypeConfig {
  extension: string
  handlerId: string | null
  availableHandlers: IExtension<FileHandlerMeta>[]
}

export function FileHandlersSettings() {
  const { sqlite } = useSqlite()
  const { navigate } = useRouterAdapter()
  const { database } = useCurrentPathInfo()
  const [fileHandlers, setFileHandlers] = useState<
    IExtension<FileHandlerMeta>[]
  >([])
  const [fileTypeConfigs, setFileTypeConfigs] = useState<FileTypeConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load all file handler extensions
  useEffect(() => {
    if (!sqlite) return

    const loadFileHandlers = async () => {
      try {
        setIsLoading(true)
        const allExtensions = await sqlite.extension.list()
        const handlers = allExtensions.filter(
          (ext): ext is IExtension<FileHandlerMeta> =>
            ext.meta?.type === BlockExtensionType.FileHandler
        )
        setFileHandlers(handlers)

        // Build file type configs
        const extensionsMap = new Map<string, FileTypeConfig>()

        // Get all unique file extensions
        for (const handler of handlers) {
          const meta = handler.meta as FileHandlerMeta
          for (const ext of meta.fileHandler.extensions || []) {
            if (!extensionsMap.has(ext)) {
              extensionsMap.set(ext, {
                extension: ext,
                handlerId: null,
                availableHandlers: [],
              })
            }
            extensionsMap.get(ext)!.availableHandlers.push(handler)
          }
        }

        // Load default handlers from KV store
        const configs = Array.from(extensionsMap.values())
        for (const config of configs) {
          const key = `eidos:space:file:handler:default:${config.extension}`
          const handlerId = await sqlite.kv.get(key, "text")
          config.handlerId = handlerId
        }

        setFileTypeConfigs(configs)
      } catch (error) {
        console.error("Error loading file handlers:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadFileHandlers()
  }, [sqlite])

  const handleSetDefaultHandler = async (
    extension: string,
    handlerId: string
  ) => {
    if (!sqlite) return

    try {
      const key = `eidos:space:file:handler:default:${extension}`
      await sqlite.kv.put(key, handlerId)

      // Update local state
      setFileTypeConfigs((configs) =>
        configs.map((config) =>
          config.extension === extension ? { ...config, handlerId } : config
        )
      )
    } catch (error) {
      console.error("Error setting default handler:", error)
    }
  }

  const handleClearDefaultHandler = async (extension: string) => {
    if (!sqlite) return

    try {
      const key = `eidos:space:file:handler:default:${extension}`
      await sqlite.kv.delete(key)

      // Update local state
      setFileTypeConfigs((configs) =>
        configs.map((config) =>
          config.extension === extension
            ? { ...config, handlerId: null }
            : config
        )
      )
    } catch (error) {
      console.error("Error clearing default handler:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading file handlers...
      </div>
    )
  }

  return (
    <div className="space-y-0">
      <div className="py-4">
        <h3 className="text-lg font-medium">File Handlers</h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              File handlers are block extensions that can open and edit specific
              file types. When a file type has multiple handlers, you can set a
              default here. If no default is set, you'll be prompted to choose a
              handler when opening files of that type.
            </p>
            {fileHandlers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No file handler extensions installed.</p>
                <p className="text-sm mt-2">
                  Install block extensions with file handler support to manage
                  file associations.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-0.5">
                    <Label>Enabled File Handlers</Label>
                    <p className="text-sm text-muted-foreground">
                      File handler extensions available in this space
                    </p>
                  </div>
                  <div className="space-y-2">
                    {fileHandlers.map((handler) => {
                      const meta = handler.meta as FileHandlerMeta
                      const extensions = meta.fileHandler.extensions || []
                      return (
                        <div
                          key={handler.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                          onClick={() => {
                            closeSettings()
                            navigate(`/extensions/${handler.id}`)
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {meta.fileHandler.icon && (
                                <span className="text-lg">
                                  {meta.fileHandler.icon}
                                </span>
                              )}
                              <span className="font-medium">
                                {meta.fileHandler.title}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {extensions.map((ext) => (
                                <Badge
                                  key={ext}
                                  variant="outline"
                                  className="text-xs font-mono"
                                >
                                  {ext}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <ExternalLinkIcon className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {fileTypeConfigs.length > 0 && (
                  <div className="space-y-4">
                    <div className="space-y-0.5">
                      <Label>File Type Associations</Label>
                      <p className="text-sm text-muted-foreground">
                        Set default handlers for file types with multiple
                        options
                      </p>
                    </div>
                    <div className="space-y-3">
                      {fileTypeConfigs.map((config) => {
                        const defaultHandler = config.availableHandlers.find(
                          (h) => h.id === config.handlerId
                        )

                        return (
                          <div
                            key={config.extension}
                            className="flex items-center justify-between p-4 border rounded-lg"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-sm font-medium">
                                {config.extension}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {config.availableHandlers.length} handler(s)
                                available
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {config.availableHandlers.length > 1 ? (
                                <>
                                  <Select
                                    value={config.handlerId || ""}
                                    onValueChange={(value) =>
                                      handleSetDefaultHandler(
                                        config.extension,
                                        value
                                      )
                                    }
                                  >
                                    <SelectTrigger className="w-[200px]">
                                      <SelectValue placeholder="Select default..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {config.availableHandlers.map(
                                        (handler) => {
                                          const meta =
                                            handler.meta as FileHandlerMeta
                                          return (
                                            <SelectItem
                                              key={handler.id}
                                              value={handler.id}
                                            >
                                              {meta.fileHandler.icon && (
                                                <span className="mr-2">
                                                  {meta.fileHandler.icon}
                                                </span>
                                              )}
                                              {meta.fileHandler.title}
                                            </SelectItem>
                                          )
                                        }
                                      )}
                                    </SelectContent>
                                  </Select>
                                  {config.handlerId && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleClearDefaultHandler(
                                          config.extension
                                        )
                                      }
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <div className="text-sm text-muted-foreground">
                                  {defaultHandler
                                    ? (defaultHandler.meta as FileHandlerMeta)
                                        .fileHandler.title
                                    : config.availableHandlers[0]
                                      ? (
                                          config.availableHandlers[0]
                                            .meta as FileHandlerMeta
                                        ).fileHandler.title
                                      : "No handler"}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
