import { useState } from "react"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

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
import { Textarea } from "@/components/ui/textarea"

interface EnvironmentVariablesProps {
  envMap: Record<string, string>
  onUpdateEnvMap: (newEnvMap: Record<string, string>) => void
}

export const EnvironmentVariables = ({
  envMap,
  onUpdateEnvMap,
}: EnvironmentVariablesProps) => {
  const { t } = useTranslation()
  const [newEnvKey, setNewEnvKey] = useState("")
  const [newEnvValue, setNewEnvValue] = useState("")
  const [bulkEnvInput, setBulkEnvInput] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingEnvKeys, setEditingEnvKeys] = useState<Set<string>>(new Set())
  const [editingValues, setEditingValues] = useState<Record<string, string>>({})

  const handleAddEnv = () => {
    if (!newEnvKey.trim()) return
    const newMap = { ...envMap, [newEnvKey]: newEnvValue }
    onUpdateEnvMap(newMap)
    setNewEnvKey("")
    setNewEnvValue("")
  }

  const handleRemoveEnv = (key: string) => {
    const newMap = { ...envMap }
    delete newMap[key]
    onUpdateEnvMap(newMap)
  }

  const handleEnvValueChange = (key: string, value: string) => {
    const newMap = { ...envMap, [key]: value }
    onUpdateEnvMap(newMap)
  }

  const handleBulkAdd = () => {
    const pairs = bulkEnvInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("="))
      .map((line) => {
        const [key, ...values] = line.split("=")
        return [key.trim(), values.join("=").trim()]
      })

    const newEnvMap = { ...envMap }
    pairs.forEach(([key, value]) => {
      if (key) {
        newEnvMap[key] = value
      }
    })

    onUpdateEnvMap(newEnvMap)
    setBulkEnvInput("")
    setIsDialogOpen(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("extension.config.environmentVariables")}</CardTitle>
        <CardDescription>
          {t("extension.config.environmentVariablesDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Existing Environment Variables */}
          {Object.entries(envMap).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <Input value={key} disabled className="w-[200px]" />
              <Input
                value={editingEnvKeys.has(key) ? editingValues[key] : value}
                disabled={!editingEnvKeys.has(key)}
                onChange={(e) => {
                  setEditingValues((prev) => ({
                    ...prev,
                    [key]: e.target.value,
                  }))
                }}
                className="w-[200px]"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (editingEnvKeys.has(key)) {
                    handleEnvValueChange(key, editingValues[key])
                    setEditingEnvKeys((prev) => {
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
                    setEditingEnvKeys((prev) => new Set(prev).add(key))
                    setEditingValues((prev) => ({
                      ...prev,
                      [key]: value,
                    }))
                  }
                }}
              >
                {editingEnvKeys.has(key) ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleRemoveEnv(key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {/* Add New Environment Variable */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Key"
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              className="w-[200px]"
            />
            <Input
              placeholder="Value"
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
              className="w-[200px]"
            />
            <Button size="icon" onClick={handleAddEnv} variant="outline">
              {newEnvKey.trim() && newEnvValue.trim() ? (
                <Check className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
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
                  <Button onClick={handleBulkAdd} className="self-end">
                    {t("extension.config.addVariables")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
