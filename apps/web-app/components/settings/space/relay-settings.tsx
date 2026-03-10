import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Copy, Plus, Trash2, Terminal, Hash, Edit2, Info } from "lucide-react"

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
  name: string
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
    name: "",
    handlerScriptId: "",
  })

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
                  name: r.name || r.id || "Unnamed",
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

  const getDefaultChannelName = () => {
    const nextNumber = relayConfig.channels.length + 1
    return `Channel ${nextNumber}`
  }

  const resetForm = () => {
    setFormData({
      id: crypto.randomUUID().replace(/-/g, ""),
      name: getDefaultChannelName(),
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
      name: channel.name,
      handlerScriptId: channel.handlerScriptId || "",
    })
    setEditingChannel(channel)
    setIsAddDialogOpen(true)
  }

  const handleSaveChannel = () => {
    const trimmedName = formData.name.trim() || getDefaultChannelName()
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
              name: trimmedName,
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
        name: trimmedName,
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
                    variant="outline"
                    className="shrink-0 h-10 w-10 p-0"
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

              {/* Channel Name */}
              <div className="space-y-2">
                <Label htmlFor="channel-name">{t("space.settings.relay.channelName")}</Label>
                <Input
                  id="channel-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={getDefaultChannelName()}
                />
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
      <div className="p-4 rounded-lg bg-muted/50 border">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{t("space.settings.relay.service")}</span>
            <p className="text-sm text-muted-foreground">
              {relayConfig.enabled
                ? t("space.settings.relay.serviceEnabled", { count: channelCount })
                : relayConfig.channels.length > 0
                  ? t("space.settings.relay.serviceDisabled", { count: relayConfig.channels.length })
                  : t("space.settings.relay.noChannels")}
            </p>
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
              className="flex items-center gap-4 p-4 rounded-lg border transition-all bg-muted/30 border-border"
            >
              {/* Channel Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{channel.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {channel.id}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => {
                      navigator.clipboard.writeText(channel.id)
                      toast({ title: t("space.settings.relay.idCopied") })
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Handler Script */}
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <Terminal className="h-4 w-4" />
                <span className="truncate max-w-[150px]">
                  {channel.handlerScriptId
                    ? relayHandlers.find((h) => h.id === channel.handlerScriptId)
                        ?.name || t("space.settings.relay.unknownScript")
                    : t("space.settings.relay.noHandlerLabel")}
                </span>
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
                  className="h-8 w-8 text-destructive hover:text-destructive"
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
