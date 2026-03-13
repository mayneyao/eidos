import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Copy, Plus, Trash2, Terminal, Hash, Edit2, Info, AlertCircle } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import type { RelayChannel, RelayConfig } from "@/apps/web-app/hooks/use-current-space"
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

  const [relayConfig, setRelayConfig] = useState<RelayConfig>({ enabled: false, channels: [] })
  const [isInitializing, setIsInitializing] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<RelayChannel | null>(null)
  const [formData, setFormData] = useState<ChannelFormData>({
    id: "",
    handlerScriptId: "",
  })
  
  // Message counts state
  const [channelCounts, setChannelCounts] = useState<Record<string, { pending: number; deadLetter: number }>>({})
  const [totalCounts, setTotalCounts] = useState<{ pending: number; deadLetter: number }>({ pending: 0, deadLetter: 0 })

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
                }))
              }
              // Automatically save migration
              await window.eidos.invoke("update-space", space, {
                relay: config,
                relays: null
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
    if (isDesktopMode && typeof window !== "undefined" && window.eidos && space) {
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
        const result = await window.eidos.invoke("get-relay-channel-counts", space, { channelId: channel.id })
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
        description: t("space.settings.relay.maxChannelsDescription", { max: MAX_CHANNELS }),
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

  const handleDeleteChannel = (id: string) => {
    if (confirm(t("space.settings.relay.deleteConfirm"))) {
      const newChannels = relayConfig.channels.filter((c) => c.id !== id)
      saveRelayConfig({ ...relayConfig, channels: newChannels })
      toast({ title: t("space.settings.relay.channelRemoved") })
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

  if (isInitializing) {
    return <div className="py-6 text-sm text-muted-foreground">{t("space.settings.relay.loading")}</div>
  }

  const channelCount = relayConfig.channels.length

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("space.settings.relay.description")}
          </p>
          {relayConfig.channels.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("space.settings.relay.channelCount", { current: relayConfig.channels.length, max: MAX_CHANNELS })}
            </p>
          )}
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={handleOpenAddDialog}
              size="sm"
              disabled={relayConfig.channels.length >= MAX_CHANNELS}
            >
              <Plus className="h-4 w-4 mr-1" /> {t("space.settings.relay.addChannel")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingChannel ? t("space.settings.relay.editChannel") : t("space.settings.relay.addChannel")}
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
                <Label htmlFor="channel-id">{t("space.settings.relay.channelId")}</Label>
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
                    variant="ghost"
                    className="shrink-0 h-8 w-8 p-0"
                    onClick={() =>
                      setFormData({ ...formData, id: crypto.randomUUID().replace(/-/g, "") })
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
                <Label htmlFor="handler-script">{t("space.settings.relay.handlerScript")}</Label>
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
                    <SelectValue placeholder={t("space.settings.relay.selectScriptPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("space.settings.relay.noHandler")}</SelectItem>
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
                {editingChannel ? t("space.settings.relay.saveChanges") : t("space.settings.relay.addChannelButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Relay Master Toggle */}
      <div className="p-5 rounded-xl bg-gradient-to-br from-muted/80 to-muted/30 border shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`p-2.5 rounded-full ${relayConfig.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <Hash className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-semibold">{t("space.settings.relay.service")}</span>
              <p className="text-sm text-muted-foreground line-clamp-1">
                {relayConfig.enabled
                  ? t("space.settings.relay.serviceEnabled", { count: channelCount })
                  : relayConfig.channels.length > 0
                    ? t("space.settings.relay.serviceDisabled", { count: relayConfig.channels.length })
                    : t("space.settings.relay.noChannels")}
              </p>
              {/* Message Statistics */}
              {(totalCounts.pending > 0 || totalCounts.deadLetter > 0) && (
                <div className="flex items-center gap-2 mt-2">
                  {totalCounts.pending > 0 && (
                    <span 
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                      title={t("space.settings.relay.pendingTooltip")}
                    >
                      {t("space.settings.relay.pendingShort")}: {totalCounts.pending}
                    </span>
                  )}
                  {totalCounts.deadLetter > 0 && (
                    <span 
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                      title={t("space.settings.relay.deadLetterTooltip")}
                    >
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {t("space.settings.relay.deadLetterShort")}: {totalCounts.deadLetter}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <Switch
            checked={relayConfig.enabled}
            disabled={relayConfig.channels.length === 0}
            onCheckedChange={handleToggleRelay}
          />
        </div>
      </div>

      {/* Channel List */}
      <div className="space-y-2">
        {relayConfig.channels.length === 0 ? (
          <div className="p-8 text-center border border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground mb-4">
              {t("space.settings.relay.noChannelsDescription")}
            </p>
            <Button variant="outline" onClick={handleOpenAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              {t("space.settings.relay.createFirst")}
            </Button>
          </div>
        ) : (
          relayConfig.channels.map((channel) => (
            <div
              key={channel.id}
              className="group flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border transition-all hover:bg-muted/40 bg-muted/10 border-border/50 hover:border-border hover:shadow-sm"
            >
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="flex items-center gap-2 px-0 py-1">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <code className="text-sm font-mono font-bold truncate max-w-[180px] sm:max-w-[350px]">
                    {channel.id}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(channel.id)
                      toast({ title: t("space.settings.relay.idCopied") })
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Message Counts */}
              <div className="flex items-center gap-2 empty:hidden">
                {(() => {
                  const counts = channelCounts[channel.id]
                  if (!counts || (counts.pending === 0 && counts.deadLetter === 0)) return null
                  return (
                    <>
                      {counts.pending > 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold border border-blue-500/20" title={t("space.settings.relay.pendingTooltip")}>
                          {counts.pending}
                        </span>
                      )}
                      {counts.deadLetter > 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold border border-red-500/20" title={t("space.settings.relay.deadLetterTooltip")}>
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {counts.deadLetter}
                        </span>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Handler Script */}
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground bg-muted/20 px-3 py-1.5 rounded-lg border border-transparent group-hover:border-border/30 transition-colors">
                <Terminal className="h-3.5 w-3.5" />
                <span className="truncate max-w-[120px] sm:max-w-[180px]">
                  {channel.handlerScriptId
                    ? relayHandlers.find((h) => h.id === channel.handlerScriptId)
                        ?.name || t("space.settings.relay.unknownScript")
                    : t("space.settings.relay.noHandlerLabel")}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => handleOpenEditDialog(channel)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDeleteChannel(channel.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
