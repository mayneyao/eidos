import { useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"
import { useLoaderData, useRevalidator } from "react-router-dom"

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
import { useToast } from "@/components/ui/use-toast"
import { TableSelector } from "@/components/table-selector"

import { useScript } from "../hooks/use-script"

export const BlockConfig = () => {
  const block = useLoaderData() as IScript
  const [envMap, setEnvMap] = useState<Record<string, string>>(
    block.env_map || {}
  )
  const [bindings, setBindings] = useState<
    Record<string, { type: "table"; value: string }>
  >(block.bindings || {})
  const [newEnvKey, setNewEnvKey] = useState("")
  const [newEnvValue, setNewEnvValue] = useState("")
  const [bulkEnvInput, setBulkEnvInput] = useState("")
  const [newBindingKey, setNewBindingKey] = useState("")
  const [newBindingValue, setNewBindingValue] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newBindingType, setNewBindingType] = useState<"table">("table")
  const [editingEnvKeys, setEditingEnvKeys] = useState<Set<string>>(new Set())
  const [editingValues, setEditingValues] = useState<Record<string, string>>({})

  const revalidator = useRevalidator()
  const { toast } = useToast()
  const { updateScript } = useScript()

  const updateWithToast = async (
    newEnvMap = envMap,
    newBindings = bindings
  ) => {
    try {
      await updateScript({
        id: block.id,
        env_map: newEnvMap,
        bindings: newBindings,
      })
      revalidator.revalidate()
      toast({ title: "Block Updated Successfully" })
    } catch (error) {
      toast({
        title: "Failed to update block",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleAddEnv = () => {
    if (!newEnvKey.trim()) return
    setEnvMap((prev) => {
      const newMap = { ...prev, [newEnvKey]: newEnvValue }
      updateWithToast(newMap)
      return newMap
    })
    setNewEnvKey("")
    setNewEnvValue("")
  }

  const handleRemoveEnv = (key: string) => {
    setEnvMap((prev) => {
      const newMap = { ...prev }
      delete newMap[key]
      updateWithToast(newMap)
      return newMap
    })
  }

  const handleEnvValueChange = (key: string, value: string) => {
    setEnvMap((prev) => {
      const newMap = { ...prev, [key]: value }
      updateWithToast(newMap)
      return newMap
    })
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

    setEnvMap(newEnvMap)
    updateWithToast(newEnvMap)
    setBulkEnvInput("")
    setIsDialogOpen(false)
  }

  const handleAddBinding = () => {
    if (!newBindingKey.trim()) return
    setBindings((prev) => {
      const newBindings = {
        ...prev,
        [newBindingKey]: {
          type: newBindingType,
          value: newBindingValue,
        },
      }
      updateWithToast(envMap, newBindings)
      return newBindings
    })
    setNewBindingKey("")
    setNewBindingValue("")
  }

  const handleRemoveBinding = (key: string) => {
    setBindings((prev) => {
      const newBindings = { ...prev }
      delete newBindings[key]
      updateWithToast(envMap, newBindings)
      return newBindings
    })
  }

  const handleBindingValueChange = (key: string, value: string) => {
    setBindings((prev) => {
      const newBindings = {
        ...prev,
        [key]: { type: "table" as const, value },
      }
      updateWithToast(envMap, newBindings)
      return newBindings
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
          <CardDescription>
            Configure environment variables for this block
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
                  <Button variant="outline">Bulk Add</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Bulk Add Environment Variables</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <Textarea
                      placeholder="Enter multiple environment variables&#10;Format: KEY=VALUE&#10;Example:&#10;DB_HOST=localhost&#10;DB_PORT=5432"
                      value={bulkEnvInput}
                      onChange={(e) => setBulkEnvInput(e.target.value)}
                      className="min-h-[200px]"
                    />
                    <Button onClick={handleBulkAdd} className="self-end">
                      Add Variables
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bindings</CardTitle>
          <CardDescription>Configure bindings for this block</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Existing Bindings */}
            {Object.entries(bindings).map(([key, binding]) => (
              <div key={key} className="flex items-center gap-2">
                <Select disabled value={binding.type}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="table">Table</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={key} disabled className="w-[200px]" />
                <TableSelector
                  value={binding.value}
                  onSelect={(value) => {
                    handleBindingValueChange(key, value)
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleRemoveBinding(key)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {/* Add New Binding */}
            <div className="flex items-center gap-2">
              <Select
                value={newBindingType}
                onValueChange={(value: "table") => setNewBindingType(value)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Key"
                value={newBindingKey}
                onChange={(e) => setNewBindingKey(e.target.value)}
                className="w-[200px]"
              />
              <TableSelector
                value={newBindingValue}
                onSelect={setNewBindingValue}
              />
              <Button size="icon" onClick={handleAddBinding} variant="outline">
                {newBindingKey.trim() && newBindingValue.trim() ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
