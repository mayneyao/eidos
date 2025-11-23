import { useEffect, useState } from "react"
import { FolderOpen, FolderPlus, MoreHorizontal, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useMounts, type MountConfig } from "@/apps/web-app/hooks/use-mounts"

export function MountSettings() {
  const { t } = useTranslation()
  const { mounts, isLoading, addMount, removeMount } = useMounts()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newMountName, setNewMountName] = useState("")
  const [newMountPath, setNewMountPath] = useState("")

  const handleAddMount = async () => {
    if (!newMountName.trim() || !newMountPath.trim()) {
      toast.error(t("space.settings.mounts.nameAndPathRequired"))
      return
    }

    try {
      await addMount(newMountName.trim(), newMountPath.trim())
      toast.success(t("space.settings.mounts.addSuccess"))
      setNewMountName("")
      setNewMountPath("")
      setIsDialogOpen(false)
    } catch (error) {
      console.error('Failed to add mount:', error)
      toast.error(error instanceof Error ? error.message : t("space.settings.mounts.addError"))
    }
  }

  const handleRemoveMount = async (mountName: string) => {
    try {
      await removeMount(mountName)
      toast.success(t("space.settings.mounts.removeSuccess"))
    } catch (error) {
      console.error('Failed to remove mount:', error)
      toast.error(t("space.settings.mounts.removeError"))
    }
  }

  const handleSelectDirectory = async () => {
    try {
      const selectedFolder = await window.eidos.selectFolder()
      if (selectedFolder) {
        setNewMountPath(selectedFolder)
      }
    } catch (error) {
      // User cancelled the picker
      console.log('Directory selection cancelled')
    }
  }

  const handleOpenFolder = async (mountPath: string) => {
    try {
      if (typeof window.eidos !== "undefined" && window.eidos.showInFileManager) {
        window.eidos.showInFileManager(mountPath)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  }

  return (
    <div className="space-y-0">
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("space.settings.mounts.title")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-4">
                {t("space.settings.mounts.description")}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("space.settings.mounts.configuredMounts")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("space.settings.mounts.configuredMountsDescription")}
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  {t("space.settings.mounts.addMount")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("space.settings.mounts.addMount")}</DialogTitle>
                  <DialogDescription>
                    {t("space.settings.mounts.addMountDescription")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="mount-name">
                      {t("space.settings.mounts.mountName")}
                    </Label>
                    <Input
                      id="mount-name"
                      value={newMountName}
                      onChange={(e) => setNewMountName(e.target.value)}
                      placeholder={t("space.settings.mounts.mountNamePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mount-path">
                      {t("space.settings.mounts.mountPath")}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="mount-path"
                        value={newMountPath}
                        onChange={(e) => setNewMountPath(e.target.value)}
                        placeholder={t("space.settings.mounts.mountPathPlaceholder")}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSelectDirectory}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={handleAddMount}>
                    {t("space.settings.mounts.addMount")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="max-w-4xl">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                {t("space.settings.mounts.loading")}
              </div>
            ) : mounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("space.settings.mounts.noMounts")}</p>
                <p className="text-sm mt-1">
                  {t("space.settings.mounts.noMountsDescription")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {mounts.map((mount) => (
                  <div
                    key={mount.name}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-md">
                          <FolderOpen className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {mount.name}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {mount.path}
                          </p>
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenFolder(mount.path)}>
                          <FolderOpen className="h-4 w-4 mr-2" />
                          {t("common.open")}
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t("space.settings.mounts.removeMount")}
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("space.settings.mounts.confirmRemove")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("space.settings.mounts.confirmRemoveDescription", {
                                  name: mount.name,
                                  path: mount.path,
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("common.cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemoveMount(mount.name)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("space.settings.mounts.removeMount")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
