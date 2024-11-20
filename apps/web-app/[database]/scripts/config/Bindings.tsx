import { useState } from "react"
import { Check, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableSelector } from "@/components/table-selector"

interface BindingsProps {
  bindings: Record<string, { type: "table"; value: string }>
  onUpdateBindings: (
    newBindings: Record<string, { type: "table"; value: string }>
  ) => void
}

export const Bindings = ({ bindings, onUpdateBindings }: BindingsProps) => {
  const [newBindingKey, setNewBindingKey] = useState("")
  const [newBindingValue, setNewBindingValue] = useState("")
  const [newBindingType, setNewBindingType] = useState<"table">("table")

  const handleAddBinding = () => {
    if (!newBindingKey.trim()) return
    const newBindings = {
      ...bindings,
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
    const newBindings = { ...bindings }
    delete newBindings[key]
    onUpdateBindings(newBindings)
  }

  const handleBindingValueChange = (key: string, value: string) => {
    const newBindings = {
      ...bindings,
      [key]: { type: "table" as const, value },
    }
    onUpdateBindings(newBindings)
  }

  return (
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
                onSelect={(value) => handleBindingValueChange(key, value)}
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
  )
}
