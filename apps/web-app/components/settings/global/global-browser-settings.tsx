import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Globe, Plus, Trash2, Edit2, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/components/ui/use-toast"

import type { SearchEngineConfig } from "../stores/browser-settings-store"
import {
  useBrowserSettingsStore,
  getAllSearchEngines,
  BUILT_IN_SEARCH_ENGINES,
} from "../stores/browser-settings-store"
import { useCurrentSpaceId } from "@/hooks/use-current-space"

export function GlobalBrowserSettings() {
  const { t } = useTranslation()
  const {
    config,
    initialize,
    isLoading,
    setDefaultSearchEngine,
    setOpenLinksInBuiltInBrowser,
    setEnableRawData,
    addCustomSearchEngine,
    updateCustomSearchEngine,
    removeCustomSearchEngine,
  } = useBrowserSettingsStore()

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEngine, setEditingEngine] = useState<SearchEngineConfig | null>(
    null
  )
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean
    engineId: string
    engineName: string
  }>({ isOpen: false, engineId: "", engineName: "" })

  const [formData, setFormData] = useState({
    name: "",
    url: "",
  })

  useEffect(() => {
    initialize()
  }, [initialize])

  const spaceId = useCurrentSpaceId()
  const [supportedWebsites, setSupportedWebsites] = useState<
    { site: string; domain: string; binaries?: string[]; resources: string[] }[]
  >([])

  useEffect(() => {
    const fetchSupportedWebsites = async () => {
      if (config.enableRawData && spaceId && window.eidos?.rawData) {
        try {
          const adapters = await window.eidos.rawData.getAdapters(spaceId)
          const sites = adapters.map((a: any) => ({
            site: a.adapter.meta.site,
            domain: a.adapter.meta.domain,
            resource: a.adapter.meta.name,
            binaries: a.adapter.protocol?.binaries,
          }))
          // Group by domain or site to unique list, merging binaries and collecting resources
          const siteMap = new Map<string, any>()
          sites.forEach((s: any) => {
            if (!siteMap.has(s.domain)) {
              siteMap.set(s.domain, {
                ...s,
                binaries: new Set(s.binaries || []),
                resources: new Set([s.resource]),
              })
            } else {
              const existing = siteMap.get(s.domain)
              if (s.binaries) {
                s.binaries.forEach((b: string) => existing.binaries.add(b))
              }
              existing.resources.add(s.resource)
            }
          })

          const uniqueSites = Array.from(siteMap.values()).map((s: any) => ({
            ...s,
            binaries: Array.from(s.binaries) as string[],
            resources: Array.from(s.resources) as string[],
          }))
          setSupportedWebsites(uniqueSites)
        } catch (e) {
          console.error("Failed to fetch supported websites:", e)
        }
      } else {
        setSupportedWebsites([])
      }
    }
    fetchSupportedWebsites()
  }, [config.enableRawData, spaceId])

  const allEngines = getAllSearchEngines(config)
  const customEngines = config.customSearchEngines

  const handleAddEngine = async () => {
    if (!formData.name || !formData.url) {
      toast({
        title: t("common.error"),
        description: t("settings.browser.nameAndUrlRequired"),
        variant: "destructive",
      })
      return
    }

    if (!formData.url.includes("{query}")) {
      toast({
        title: t("common.error"),
        description: t("settings.browser.urlMustContainQuery"),
        variant: "destructive",
      })
      return
    }

    const id = formData.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")

    // Check for duplicate ID
    if (allEngines.some((e) => e.id === id)) {
      toast({
        title: t("common.error"),
        description: t("settings.browser.engineIdExists"),
        variant: "destructive",
      })
      return
    }

    await addCustomSearchEngine({
      id,
      name: formData.name,
      url: formData.url,
    })

    setFormData({ name: "", url: "" })
    setShowAddForm(false)

    toast({
      title: t("settings.browser.engineAdded"),
      description: t("settings.browser.engineAddedDescription", {
        name: formData.name,
      }),
    })
  }

  const handleUpdateEngine = async () => {
    if (!editingEngine) return

    if (!formData.name || !formData.url) {
      toast({
        title: t("common.error"),
        description: t("settings.browser.nameAndUrlRequired"),
        variant: "destructive",
      })
      return
    }

    if (!formData.url.includes("{query}")) {
      toast({
        title: t("common.error"),
        description: t("settings.browser.urlMustContainQuery"),
        variant: "destructive",
      })
      return
    }

    await updateCustomSearchEngine({
      ...editingEngine,
      name: formData.name,
      url: formData.url,
    })

    setEditingEngine(null)
    setFormData({ name: "", url: "" })

    toast({
      title: t("settings.browser.engineUpdated"),
      description: t("settings.browser.engineUpdatedDescription"),
    })
  }

  const openDeleteDialog = (engine: SearchEngineConfig) => {
    setDeleteDialog({
      isOpen: true,
      engineId: engine.id,
      engineName: engine.name,
    })
  }

  const closeDeleteDialog = () => {
    setDeleteDialog({ isOpen: false, engineId: "", engineName: "" })
  }

  const confirmDelete = async () => {
    await removeCustomSearchEngine(deleteDialog.engineId)
    closeDeleteDialog()
    toast({
      title: t("settings.browser.engineRemoved"),
      description: t("settings.browser.engineRemovedDescription"),
    })
  }

  const startEdit = (engine: SearchEngineConfig) => {
    setEditingEngine(engine)
    setFormData({
      name: engine.name,
      url: engine.url,
    })
    setShowAddForm(false)
  }

  const cancelEdit = () => {
    setEditingEngine(null)
    setFormData({ name: "", url: "" })
  }

  if (isLoading) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Header Section */}
      <div className="py-3 flex items-center justify-between gap-4">
        <h3 className="text-base font-medium">
          {t("settings.browser.searchEngines", "Search Engines")}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowAddForm(true)
            setEditingEngine(null)
            setFormData({ name: "", url: "" })
          }}
          disabled={showAddForm || !!editingEngine}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("common.button.add")}
        </Button>
      </div>

      <hr className="border-border" />

      <div className="py-4">
        <div className="space-y-3">
          {/* Search Engines List */}
          <div className="space-y-1">
            {allEngines.map((engine) => {
              const isBuiltIn = BUILT_IN_SEARCH_ENGINES.some(
                (e) => e.id === engine.id
              )
              return (
                <div
                  key={engine.id}
                  className={`grid grid-cols-[1fr_100px_90px] gap-3 px-3 py-2 items-center rounded-md border ${
                    isBuiltIn
                      ? "border-muted bg-muted/30"
                      : "hover:border-primary/50 transition-colors"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isBuiltIn ? (
                      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {engine.name}
                        </span>
                        {config.defaultSearchEngine === engine.id && (
                          <Badge
                            variant="secondary"
                            className="text-green-600 bg-green-50 dark:bg-green-950/30 shrink-0 text-xs px-1.5 py-0"
                          >
                            {t("settings.browser.default", "Default")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {engine.shortcut || engine.id}
                  </div>
                  <div className="flex items-center justify-end gap-0.5">
                    {config.defaultSearchEngine !== engine.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultSearchEngine(engine.id)}
                        className="h-7 px-2 text-xs"
                      >
                        {t("settings.browser.setDefault", "Default")}
                      </Button>
                    )}
                    {!isBuiltIn && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEdit(engine)}
                          className="h-7 w-7"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(engine)}
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingEngine) && (
        <>
          <hr className="border-border" />

          <div className="py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">
                {editingEngine
                  ? t("settings.browser.editEngine", "Edit Search Engine")
                  : t("settings.browser.addEngine", "Add Search Engine")}
              </h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="engine-name" className="text-xs">
                    {t("settings.browser.engineName", "Name")}
                  </Label>
                  <Input
                    id="engine-name"
                    placeholder="Google, Bing, etc."
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="h-8"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="engine-url" className="text-xs">
                    {t("settings.browser.searchUrl", "Search URL")}
                  </Label>
                  <Input
                    id="engine-url"
                    placeholder="https://www.google.com/search?q={query}"
                    value={formData.url}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, url: e.target.value }))
                    }
                    className="h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "settings.browser.searchUrlDescription",
                      "Use {query} as placeholder for the search term"
                    )}
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false)
                      cancelEdit()
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={
                      editingEngine ? handleUpdateEngine : handleAddEngine
                    }
                  >
                    {editingEngine ? t("common.save") : t("common.button.add")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Link Handling Section */}
      <hr className="border-border" />

      <div className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm">
              {t(
                "settings.browser.openLinksInBuiltInBrowser",
                "Open Links in Built-in Browser"
              )}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.browser.openLinksInBuiltInBrowserDescription",
                "When enabled, external links will open in Eidos' built-in browser."
              )}
            </p>
          </div>
          <Switch
            checked={config.openLinksInBuiltInBrowser}
            onCheckedChange={setOpenLinksInBuiltInBrowser}
            disabled={isLoading}
            className="shrink-0"
          />
        </div>
      </div>

      <hr className="border-border" />

      <div className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm flex items-center gap-1.5">
              {t("settings.browser.enableRawData", "Enable Raw Data")}
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                {t("common.badge.alpha")}
              </span>
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.browser.enableRawDataDescription",
                "When enabled, allows syncing external data via adapters in the built-in browser."
              )}
              <a
                href="https://docs.eidos.space/extensions/rawdata-adapter/#custom-adapters"
                target="_blank"
                rel="noreferrer"
                className="ml-1 text-primary hover:underline inline-flex items-center gap-0.5"
              >
                {t("settings.browser.howToCustomizeAdapters")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <Switch
            checked={config.enableRawData}
            onCheckedChange={setEnableRawData}
            disabled={isLoading}
            className="shrink-0"
          />
        </div>

        {config.enableRawData && supportedWebsites.length > 0 && (
          <div className="mt-4 ml-1 pl-4 border-l-2 border-muted/50 space-y-3">
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("settings.browser.supportedWebsites", "Supported Websites")}
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {supportedWebsites.map((site) => (
                <div
                  key={site.domain}
                  className="flex items-center gap-2.5 p-2 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="h-7 w-7 rounded bg-background border flex items-center justify-center shrink-0 relative overflow-hidden">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=64`}
                      alt={site.site}
                      className="h-4 w-4 z-10"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = "none"
                      }}
                    />
                    <Globe className="h-3 w-3 text-muted-foreground absolute inset-0 m-auto" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <div className="text-xs font-medium truncate">
                        {site.site}
                      </div>
                      {site.binaries && site.binaries.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {site.binaries.map((bin) => (
                            <span
                              key={bin}
                              className="px-1 py-0.5 text-[9px] font-mono rounded bg-amber-100 text-amber-700 border border-amber-200"
                              title={`${bin} CLI required`}
                            >
                              {bin}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono opacity-70">
                      {site.domain}
                    </div>
                    {site.resources && site.resources.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {site.resources.map((res) => (
                          <span
                            key={res}
                            className="px-1 py-0.5 text-[9px] rounded bg-muted text-muted-foreground border border-border/50"
                          >
                            {res}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && closeDeleteDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              {t("settings.browser.deleteEngine", "Delete Search Engine")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.browser.deleteEngineDescription", {
                name: deleteDialog.engineName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteDialog}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
