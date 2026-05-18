import { useState } from "react"
import { Edit, Plus, Trash2, Key, Eye, EyeOff, Lock } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { useSecrets } from "@/hooks/use-secrets"

export function GlobalSecretsSettings() {
  const { t } = useTranslation()
  const { secrets, setSecret, deleteSecret, loading } = useSecrets()
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const handleAdd = async () => {
    const key = newKey.trim().toUpperCase()
    const val = newValue.trim()
    if (!key || !val) {
      toast({
        title: t("common.error", "Error"),
        description: t(
          "settings.secrets.keyAndValueRequired",
          "Key and Value are required."
        ),
        variant: "destructive",
      })
      return
    }
    try {
      await setSecret(key, val)
      setNewKey("")
      setNewValue("")
      setIsAdding(false)
      toast({
        title: t("common.success", "Success"),
        description: t("settings.secrets.addSuccess", {
          defaultValue: `Key "${key}" successfully saved to secure storage.`,
          key,
        }),
      })
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t("settings.secrets.addFailed", "Failed to save secret."),
        variant: "destructive",
      })
    }
  }

  const handleEditSave = async (key: string) => {
    const val = newValue.trim()
    if (!val) {
      toast({
        title: t("common.error", "Error"),
        description: t("settings.secrets.valueRequired", "Value is required."),
        variant: "destructive",
      })
      return
    }
    try {
      await setSecret(key, val)
      setEditingKey(null)
      setNewKey("")
      setNewValue("")
      toast({
        title: t("common.success", "Success"),
        description: t("settings.secrets.editSuccess", {
          defaultValue: `Key "${key}" updated successfully.`,
          key,
        }),
      })
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t(
          "settings.secrets.editFailed",
          "Failed to update secret."
        ),
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (key: string) => {
    try {
      await deleteSecret(key)
      // If we are currently editing the deleted key, clear the form
      if (editingKey === key) {
        setEditingKey(null)
        setNewKey("")
        setNewValue("")
      }
      toast({
        title: t("common.delete", "Deleted"),
        description: t("settings.secrets.deleteSuccess", {
          defaultValue: `Key "${key}" deleted from secure storage.`,
          key,
        }),
      })
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t(
          "settings.secrets.deleteFailed",
          "Failed to delete secret."
        ),
        variant: "destructive",
      })
    }
  }

  const startEdit = (key: string, val: string) => {
    setEditingKey(key)
    setNewKey(key)
    setNewValue(val)
    setIsAdding(false)
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingKey(null)
    setNewKey("")
    setNewValue("")
  }

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        {t("settings.secrets.loading", "Loading secrets...")}
      </div>
    )
  }

  const secretList = Object.entries(secrets)

  return (
    <div className="space-y-0">
      {/* Header Section */}
      <div className="py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Key className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <h3 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {t("settings.secrets.title", "Secrets Store")}
          </h3>
        </div>
        {!isAdding && !editingKey && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs shrink-0 font-medium transition-all hover:bg-zinc-50 dark:hover:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            onClick={() => {
              setIsAdding(true)
              setEditingKey(null)
              setNewKey("")
              setNewValue("")
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
            {t("settings.secrets.addSecret", "Add Secret Key")}
          </Button>
        )}
      </div>

      <hr className="border-border" />

      {/* Description Section */}
      <div className="py-5">
        <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
          {t(
            "settings.secrets.description",
            "Configure sensitive variables or API keys (like custom auth tokens, external service credentials, etc.) that will be securely encrypted on this machine and automatically injected into the AI Agent's execution environment."
          )}
        </p>
      </div>

      {/* Add / Edit Form Card (Option A: Displayed above the table list) */}
      {(isAdding || editingKey) && (
        <div className="py-4 mb-6">
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-4 max-w-2xl transition-all shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
                <Key className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <h4 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {editingKey
                  ? t("settings.secrets.editSecret", "Edit Secret Key")
                  : t(
                      "settings.secrets.newSecretPair",
                      "New Sensitive Key-Value Pair"
                    )}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="secret-key"
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  {t("settings.secrets.keyLabelShort", "Key")}
                </Label>
                <Input
                  id="secret-key"
                  placeholder="e.g. CUSTOM_API_KEY"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="h-9 text-xs font-mono focus-visible:ring-1 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  disabled={!!editingKey}
                  autoFocus={!editingKey}
                />
                {!editingKey && (
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-normal">
                    {t(
                      "settings.secrets.keyLabel",
                      "Key (uppercase, snake_case recommended)"
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="secret-value"
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  {t("settings.secrets.valueLabelShort", "Value")}
                </Label>
                <Input
                  id="secret-value"
                  type="password"
                  placeholder={t(
                    "settings.secrets.enterValue",
                    "Enter key value"
                  )}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="h-9 text-xs font-mono focus-visible:ring-1 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  autoFocus={!!editingKey}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                className="h-8 px-3 text-xs font-medium shadow-sm transition-all"
                onClick={
                  editingKey ? () => handleEditSave(editingKey) : handleAdd
                }
              >
                {editingKey
                  ? t("common.save", "Save")
                  : t("settings.secrets.saveSecret", "Save Secret")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                onClick={handleCancel}
              >
                {t("settings.secrets.cancel", "Cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Secrets List / Table */}
      <div className="py-2">
        {secretList.length === 0 ? (
          <div className="p-10 text-center border border-dashed rounded-xl bg-zinc-50/30 dark:bg-zinc-900/10 border-zinc-200 dark:border-zinc-800/80 transition-all">
            <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mx-auto mb-3">
              <Lock className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-4">
              {t("settings.secrets.noSecrets", "No sensitive keys configured")}
            </p>
            {!isAdding && !editingKey && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-xs"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.secrets.addSecret", "Add Secret Key")}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden border border-zinc-200 dark:border-zinc-800/80 rounded-xl bg-white dark:bg-zinc-950 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-fixed min-w-[600px]">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40">
                    <th className="p-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[240px] select-none">
                      {t("settings.secrets.keyLabelShort", "Key")}
                    </th>
                    <th className="p-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none">
                      {t("settings.secrets.valueLabelShort", "Value")}
                    </th>
                    <th className="p-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[120px] select-none">
                      {t("settings.secrets.scopeLabel", "Scope")}
                    </th>
                    <th className="p-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right w-[110px] select-none">
                      {t("settings.secrets.actionsLabel", "Actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                  {secretList.map(([key, val]) => {
                    const isBeingEdited = editingKey === key
                    return (
                      <tr
                        key={key}
                        className={`transition-colors duration-150 h-[52px] ${
                          isBeingEdited
                            ? "bg-zinc-50/70 dark:bg-zinc-900/30"
                            : "hover:bg-zinc-50/30 dark:hover:bg-zinc-900/10"
                        }`}
                      >
                        {/* Key Column */}
                        <td className="p-3.5 align-middle truncate">
                          <span
                            className="font-mono text-sm font-semibold select-all text-zinc-900 dark:text-zinc-100 block truncate"
                            title={key}
                          >
                            {key}
                          </span>
                        </td>

                        {/* Value Column */}
                        <td className="p-3.5 align-middle">
                          <div className="flex items-center gap-2 group min-w-0 max-w-[400px]">
                            <span
                              className={`font-mono text-xs truncate block select-none ${
                                revealedKeys[key]
                                  ? "text-zinc-800 dark:text-zinc-200 select-all"
                                  : "text-zinc-400 dark:text-zinc-600 font-semibold"
                              }`}
                            >
                              {revealedKeys[key] ? val : "••••••••••••••••"}
                            </span>
                            <button
                              onClick={() => toggleReveal(key)}
                              className="text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors p-1 shrink-0 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900"
                              title={
                                revealedKeys[key]
                                  ? t("common.hide", "Hide")
                                  : t("common.show", "Show")
                              }
                            >
                              {revealedKeys[key] ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Scope Column */}
                        <td className="p-3.5 align-middle">
                          <Badge
                            variant="outline"
                            className="text-[9px] tracking-wide py-0.5 px-1.5 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 select-none shrink-0 inline-block font-mono"
                          >
                            ENV_VAR
                          </Badge>
                        </td>

                        {/* Actions Column */}
                        <td className="p-3.5 align-middle text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 shrink-0 rounded-md transition-colors ${
                                isBeingEdited
                                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                                  : ""
                              }`}
                              onClick={() => startEdit(key, val)}
                              title={t("common.edit", "Edit")}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0 rounded-md transition-colors"
                              onClick={() => handleDelete(key)}
                              title={t("common.delete", "Delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
