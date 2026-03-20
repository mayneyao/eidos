import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  Copy,
  Plus,
  Trash2,
  Terminal,
  Hash,
  Edit2,
  AlertCircle,
  Lock,
  Radio,
  AlertTriangle,
} from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { useAuthOptional } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import type {
  RelayChannel,
  RelayConfig,
} from "@/apps/web-app/hooks/use-current-space"
import {
  useAllRelayHandlers,
  useSyncRelayHandlers,
} from "@/apps/web-app/hooks/use-all-relay-handlers"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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

interface ChannelFormData {
  id: string
  handlerScriptId: string
}

const MAX_CHANNELS = 5

export function RelaySettings() {
  const { t } = useTranslation()
  useSyncRelayHandlers()
  const { space } = useCurrentPathInfo()
  const { toast } = useToast()
  const { relayHandlers } = useAllRelayHandlers()
  const auth = useAuthOptional()
  const isAuthenticated = auth?.isAuthenticated ?? false

  const [relayConfig, setRelayConfig] = useState<RelayConfig>({
    enabled: false,
    channels: [],
  })
  const [isInitializing, setIsInitializing] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<RelayChannel | null>(
    null
  )
  const [formData, setFormData] = useState<ChannelFormData>({
    id: "",
    handlerScriptId: "",
  })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null)

  // Message counts state
  const [channelCounts, setChannelCounts] = useState<
    Record<string, { pending: number; deadLetter: number }>
  >({})
  const [totalCounts, setTotalCounts] = useState<{
    pending: number
    deadLetter: number
  }>({ pending: 0, deadLetter: 0 })

  useEffect(() => {
    const loadData = async () => {
      if (isDesktopMode) {
        try {
          const info = await window.eidos.invoke("get-current-space")
          if (info) {
            // Migration: Check for legacy relays array
            let config: RelayConfig = info.relay
            if (!config && info.relays?.length > 0) {
              config = {
                enabled: true,
                channels: info.relays.map((r: any) => ({
                  id: r.id || crypto.randomUUID().replace(/-/g, ""),
                  handlerScriptId: r.handlerScriptId,
                })),
              }
              // Automatically save migration
              await window.eidos.invoke("update-space", space, {
                relay: config,
                relays: null,
              })
            }
            setRelayConfig(config || { enabled: false, channels: [] })
          }
        } catch (error) {
          console.error("Error loading relay info:", error)
        } finally {
          setIsInitializing(false)
        }
      } else {
        setIsInitializing(false)
      }
    }
    loadData()
  }, [space])

  const saveRelayConfig = async (newConfig: RelayConfig) => {
    if (
      isDesktopMode &&
      typeof window !== "undefined" &&
      window.eidos &&
      space
    ) {
      try {
        await window.eidos.invoke("update-space", space, {
          relay: newConfig,
        })
        setRelayConfig(newConfig)
      } catch (error) {
        console.error("Error updating relay config:", error)
        toast({
          title: t("common.error"),
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
    }
  }

  const handleToggleRelay = (enabled: boolean) => {
    saveRelayConfig({ ...relayConfig, enabled })
  }

  // Fetch message counts for all channels
  const fetchMessageCounts = useCallback(async () => {
    if (!isDesktopMode || !space || relayConfig.channels.length === 0) return

    try {
      // Fetch total counts
      const total = await window.eidos.invoke("get-relay-total-counts", space)
      setTotalCounts(total)

      // Fetch per-channel counts
      const counts: Record<string, { pending: number; deadLetter: number }> = {}
      for (const channel of relayConfig.channels) {
        const result = await window.eidos.invoke(
          "get-relay-channel-counts",
          space,
          { channelId: channel.id }
        )
        counts[channel.id] = result
      }
      setChannelCounts(counts)
    } catch (error) {
      console.error("Error fetching message counts:", error)
    }
  }, [space, relayConfig.channels])

  // Poll message counts periodically
  useEffect(() => {
    fetchMessageCounts()
    const interval = setInterval(fetchMessageCounts, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [fetchMessageCounts])

  const resetForm = () => {
    setFormData({
      id: crypto.randomUUID().replace(/-/g, ""),
      handlerScriptId: "",
    })
  }

  const handleOpenAddDialog = () => {
    if (relayConfig.channels.length >= MAX_CHANNELS) {
      toast({
        title: t("space.settings.relay.maxChannelsReached"),
        description: t("space.settings.relay.maxChannelsDescription", {
          max: MAX_CHANNELS,
        }),
        variant: "destructive",
      })
      return
    }
    resetForm()
    setEditingChannel(null)
    setIsAddDialogOpen(true)
  }

  const handleOpenEditDialog = (channel: RelayChannel) => {
    setFormData({
      id: channel.id,
      handlerScriptId: channel.handlerScriptId || "",
    })
    setEditingChannel(channel)
    setIsAddDialogOpen(true)
  }

  const handleSaveChannel = () => {
    const trimmedId = formData.id.trim()

    if (!trimmedId) {
      toast({
        title: t("space.settings.relay.idRequired"),
        description: t("space.settings.relay.idRequiredDescription"),
        variant: "destructive",
      })
      return
    }

    // Check for duplicate ID (excluding current editing channel)
    const isDuplicate = relayConfig.channels.some(
      (c) => c.id === trimmedId && c.id !== editingChannel?.id
    )
    if (isDuplicate) {
      toast({
        title: t("space.settings.relay.duplicateId"),
        description: t("space.settings.relay.duplicateIdDescription"),
        variant: "destructive",
      })
      return
    }

    if (editingChannel) {
      // Update existing
      const newChannels = relayConfig.channels.map((c) =>
        c.id === editingChannel.id
          ? {
              ...c,
              id: trimmedId,
              handlerScriptId: formData.handlerScriptId || undefined,
            }
          : c
      )
      saveRelayConfig({ ...relayConfig, channels: newChannels })
      toast({ title: t("space.settings.relay.channelUpdated") })
    } else {
      // Add new
      const newChannel: RelayChannel = {
        id: trimmedId,
        handlerScriptId: formData.handlerScriptId || undefined,
      }
      saveRelayConfig({
        ...relayConfig,
        channels: [...relayConfig.channels, newChannel],
      })
      toast({ title: t("space.settings.relay.channelAdded") })
    }

    setIsAddDialogOpen(false)
    resetForm()
    setEditingChannel(null)
  }

  const openDeleteDialog = (id: string) => {
    setChannelToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleDeleteChannel = () => {
    if (channelToDelete) {
      const newChannels = relayConfig.channels.filter(
        (c) => c.id !== channelToDelete
      )
      saveRelayConfig({ ...relayConfig, channels: newChannels })
      toast({ title: t("space.settings.relay.channelRemoved") })
      setDeleteDialogOpen(false)
      setChannelToDelete(null)
    }
  }

  if (!isDesktopMode) {
    return (
      <div className="py-6">
        <p className="text-sm text-muted-foreground">
          {t("space.settings.relay.desktopOnly")}
        </p>
      </div>
    )
  }

  // Login required prompt
  if (!isAuthenticated) {
    return (
      <div className="space-y-0">
        <div className="py-4 flex items-center gap-2">
          <Radio className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">
            {t("space.settings.relay.service")}
          </h3>
        </div>

        <hr className="border-border" />

        <div className="py-6">
          <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {t("space.settings.relay.loginRequired")}
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  {t("space.settings.relay.loginRequiredDescription")}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-amber-700 dark:text-amber-300 mt-2"
                  onClick={() => auth?.login()}
                >
                  {t("settings.account.login", "Login")} →
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isInitializing) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        {t("space.settings.relay.loading")}
      </div>
    )
  }

  const hasMessages = totalCounts.pending > 0 || totalCounts.deadLetter > 0

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="py-4 flex items-center gap-2">
        <Radio className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">
          {t("space.settings.relay.service")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          {/* Master Toggle Card */}
          <div className="p-4 rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`p-2 rounded-md ${
                    relayConfig.enabled
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Radio className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {t("space.settings.relay.service")}
                    </span>
                    {relayConfig.enabled ? (
                      <Badge
                        variant="secondary"
                        className="text-green-600 shrink-0"
                      >
                        {t("common.enabled")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        {t("common.disabled")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {relayConfig.channels.length > 0
                      ? t("space.settings.relay.channelsConfigured", {
                          count: relayConfig.channels.length,
                        })
                      : t("space.settings.relay.noChannels")}
                  </p>
                </div>
              </div>
              <Switch
                checked={relayConfig.enabled}
                disabled={relayConfig.channels.length === 0}
                onCheckedChange={handleToggleRelay}
              />
            </div>

            {/* Message Statistics */}
            {hasMessages && (
              <div className="mt-4 pt-4 border-t flex items-center gap-2 flex-wrap">
                {totalCounts.pending > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-blue-600 bg-blue-50 dark:bg-blue-950/30"
                  >
                    {t("space.settings.relay.pendingShort")}:{" "}
                    {totalCounts.pending}
                  </Badge>
                )}
                {totalCounts.deadLetter > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-red-600 bg-red-50 dark:bg-red-950/30"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {t("space.settings.relay.deadLetterShort")}:{" "}
                    {totalCounts.deadLetter}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Channels Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium">
                {t("space.settings.relay.channels")}
              </h4>
              {relayConfig.channels.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  (
                  {t("space.settings.relay.channelCount", {
                    current: relayConfig.channels.length,
                    max: MAX_CHANNELS,
                  })}
                  )
                </span>
              )}
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={handleOpenAddDialog}
                  size="sm"
                  disabled={relayConfig.channels.length >= MAX_CHANNELS}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("space.settings.relay.addChannel")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>
                    {editingChannel
                      ? t("space.settings.relay.editChannel")
                      : t("space.settings.relay.addChannel")}
                  </DialogTitle>
                  <DialogDescription>
                    {editingChannel
                      ? t("space.settings.relay.editChannelDescription")
                      : t("space.settings.relay.addChannelDescription")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Channel ID */}
                  <div className="space-y-2">
                    <Label htmlFor="channel-id">
                      {t("space.settings.relay.channelId")}
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="channel-id"
                        value={formData.id}
                        onChange={(e) =>
                          setFormData({ ...formData, id: e.target.value })
                        }
                        placeholder="unique-channel-id"
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 h-9 w-9"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            id: crypto.randomUUID().replace(/-/g, ""),
                          })
                        }
                        title={t("space.settings.relay.generateId")}
                      >
                        <Hash className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("space.settings.relay.channelIdDescription")}
                    </p>
                  </div>

                  {/* Handler Script */}
                  <div className="space-y-2">
                    <Label htmlFor="handler-script">
                      {t("space.settings.relay.handlerScript")}
                    </Label>
                    <Select
                      value={formData.handlerScriptId || "none"}
                      onValueChange={(val) =>
                        setFormData({
                          ...formData,
                          handlerScriptId: val === "none" ? "" : val,
                        })
                      }
                    >
                      <SelectTrigger id="handler-script">
                        <SelectValue
                          placeholder={t(
                            "space.settings.relay.selectScriptPlaceholder"
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t("space.settings.relay.noHandler")}
                        </SelectItem>
                        {relayHandlers.map((handler) => (
                          <SelectItem key={handler.id} value={handler.id}>
                            {handler.name || handler.slug}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t("space.settings.relay.handlerScriptDescription")}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    {t("space.settings.relay.cancel")}
                  </Button>
                  <Button onClick={handleSaveChannel}>
                    {editingChannel
                      ? t("space.settings.relay.saveChanges")
                      : t("space.settings.relay.addChannelButton")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Channel List */}
          {relayConfig.channels.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-lg">
              <Radio className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-1">
                {t("space.settings.relay.noChannelsDescription")}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {t("space.settings.relay.createChannelHint")}
              </p>
              <Button variant="outline" onClick={handleOpenAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                {t("space.settings.relay.createFirst")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {relayConfig.channels.map((channel) => {
                const counts = channelCounts[channel.id]
                const hasChannelMessages =
                  counts && (counts.pending > 0 || counts.deadLetter > 0)
                const handlerName = channel.handlerScriptId
                  ? relayHandlers.find((h) => h.id === channel.handlerScriptId)
                      ?.name || t("space.settings.relay.unknownScript")
                  : null

                return (
                  <div
                    key={channel.id}
                    className="p-4 rounded-lg border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Channel ID */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                        <code className="text-sm font-mono font-medium truncate">
                          {channel.id}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(channel.id)
                            toast({
                              title: t("space.settings.relay.idCopied"),
                            })
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Message Counts & Handler */}
                      <div className="flex items-center gap-2">
                        {hasChannelMessages && (
                          <>
                            {counts!.pending > 0 && (
                              <Badge
                                variant="secondary"
                                className="text-blue-600 bg-blue-50 dark:bg-blue-950/30 text-xs"
                              >
                                {counts!.pending}
                              </Badge>
                            )}
                            {counts!.deadLetter > 0 && (
                              <Badge
                                variant="secondary"
                                className="text-red-600 bg-red-50 dark:bg-red-950/30 text-xs"
                              >
                                <AlertCircle className="h-3 w-3 mr-1" />
                                {counts!.deadLetter}
                              </Badge>
                            )}
                          </>
                        )}

                        {handlerName ? (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                            <Terminal className="h-3 w-3" />
                            <span className="truncate max-w-[100px] sm:max-w-[150px]">
                              {handlerName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                            {t("space.settings.relay.noHandlerLabel")}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenEditDialog(channel)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => openDeleteDialog(channel.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("space.settings.relay.deleteChannel")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("space.settings.relay.deleteConfirmDescription", {
                id: channelToDelete,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChannel}
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
