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

import {
  useBrowserSettingsStore,
  SearchEngineConfig,
  getAllSearchEngines,
  BUILT_IN_SEARCH_ENGINES,
} from "../stores/browser-settings-store"

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
            </p>
          </div>
          <Switch
            checked={config.enableRawData}
            onCheckedChange={setEnableRawData}
            disabled={isLoading}
            className="shrink-0"
          />
        </div>
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
