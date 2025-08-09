import { useMemo, useState } from "react"
import { Check, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { TableSelector } from "@/components/table-selector"
import type { IBindings, BindingType } from "@/packages/core/types/IExtension"

interface BindingsProps {
  bindings: IBindings
  onUpdateBindings: (newBindings: IBindings) => void
}

export const ExtensionBindings = ({ bindings, onUpdateBindings }: BindingsProps) => {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const goto = useGoto()
  const [newBindingKey, setNewBindingKey] = useState("")
  const [newBindingValue, setNewBindingValue] = useState("")
  const [newBindingType, setNewBindingType] = useState<BindingType>("table")
  const [bulkEnvInput, setBulkEnvInput] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set())
  const [editingValues, setEditingValues] = useState<Record<string, string>>({})

  const tableBindings = useMemo(() => {
    return Object.entries(bindings || {}).filter(([, v]) => v.type === "table")
  }, [bindings])

  const envBindings = useMemo(() => {
    return Object.entries(bindings || {}).filter(([, v]) => v.type === "secret" || v.type === "text")
  }, [bindings])

  const handleAddBinding = () => {
    if (!newBindingKey.trim()) return
    const newBindings: IBindings = {
      ...(bindings || {}),
      [newBindingKey]: {
        type: newBindingType,
        value: newBindingValue,
      },
    }
    onUpdateBindings(newBindings)
    setNewBindingKey("")
    setNewBindingValue("")
  }

  const handleRemoveBinding = (key: string) => {
    const newBindings: IBindings = { ...(bindings || {}) }
    delete newBindings[key]
    onUpdateBindings(newBindings)
  }

  const handleBindingValueChange = (key: string, value: string) => {
    const current = bindings?.[key]
    const newBindings: IBindings = {
      ...(bindings || {}),
      [key]: { type: current?.type || "table", value },
    }
    onUpdateBindings(newBindings)
  }

  const handleBindingTypeChange = (key: string, type: BindingType) => {
    const current = bindings?.[key]
    const newBindings: IBindings = {
      ...(bindings || {}),
      [key]: { type, value: current?.value || "" },
    }
    onUpdateBindings(newBindings)
  }

  const handleNavigateToTable = (tableName: string) => {
    if (tableName) {
      goto(space, tableName)
    }
  }

  const handleBulkAddEnv = () => {
    const pairs = bulkEnvInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("="))
      .map((line) => {
        const [key, ...values] = line.split("=")
        return [key.trim(), values.join("=").trim()]
      })

    const newBindings: IBindings = { ...(bindings || {}) }
    pairs.forEach(([key, value]) => {
      if (key) {
        newBindings[key] = { type: "secret", value }
      }
    })

    onUpdateBindings(newBindings)
    setBulkEnvInput("")
    setIsDialogOpen(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bindings</CardTitle>
        <CardDescription>Configure bindings and environment variables for this extension</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          {/* Environment Variables Section */}
          {envBindings.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Environment Variables</h3>
              <div className="flex flex-col gap-2">
                {envBindings.map(([key, binding]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Select
                      value={binding.type}
                      onValueChange={(type: "secret" | "text") => handleBindingTypeChange(key, type)}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="secret">Secret</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={key} disabled className="w-[150px]" />
                    <Input
                      value={editingKeys.has(key) ? editingValues[key] : binding.value}
                      disabled={!editingKeys.has(key)}
                      onChange={(e) => {
                        setEditingValues((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }}
                      className="flex-1"
                      type={binding.type === "secret" ? "password" : "text"}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (editingKeys.has(key)) {
                          handleBindingValueChange(key, editingValues[key])
                          setEditingKeys((prev) => {
                            const next = new Set(prev)
                            next.delete(key)
                            return next
                          })
                          setEditingValues((prev) => {
                            const next = { ...prev }
                            delete next[key]
                            return next
                          })
                        } else {
                          setEditingKeys((prev) => new Set(prev).add(key))
                          setEditingValues((prev) => ({
                            ...prev,
                            [key]: binding.value,
                          }))
                        }
                      }}
                    >
                      {editingKeys.has(key) ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleRemoveBinding(key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table Bindings Section */}
          {tableBindings.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Table Bindings</h3>
              <div className="flex flex-col gap-2">
                {tableBindings.map(([key, binding]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Select disabled value={binding.type}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table">Table</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={key} disabled className="w-[150px]" />
                    <TableSelector
                      value={binding.value}
                      onSelect={(value) => handleBindingValueChange(key, value)}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleRemoveBinding(key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {binding.value && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleNavigateToTable(binding.value)}
                        title="Go to table"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Binding */}
          <div>
            <h3 className="text-sm font-medium mb-3">Add New Binding</h3>
            <div className="flex items-center gap-2">
              <Select
                value={newBindingType}
                onValueChange={(value: BindingType) => setNewBindingType(value)}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="secret">Secret</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Key"
                value={newBindingKey}
                onChange={(e) => setNewBindingKey(e.target.value)}
                className="w-[150px]"
              />
              {newBindingType === "table" ? (
                <TableSelector
                  value={newBindingValue}
                  onSelect={(value) =>
                    setNewBindingValue(newBindingValue === value ? "" : value)
                  }
                />
              ) : (
                <Input
                  placeholder="Value"
                  value={newBindingValue}
                  onChange={(e) => setNewBindingValue(e.target.value)}
                  className="flex-1"
                  type={newBindingType === "secret" ? "password" : "text"}
                />
              )}
              <Button size="icon" onClick={handleAddBinding} variant="outline">
                {newBindingKey.trim() && newBindingValue.trim() ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
              {(newBindingType === "secret" || newBindingType === "text") && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">{t("extension.config.bulkAdd")}</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("extension.config.bulkAddTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                      <Textarea
                        placeholder={t("extension.config.bulkAddPlaceholder")}
                        value={bulkEnvInput}
                        onChange={(e) => setBulkEnvInput(e.target.value)}
                        className="min-h-[200px]"
                      />
                      <Button onClick={handleBulkAddEnv} className="self-end">
                        {t("extension.config.addVariables")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
