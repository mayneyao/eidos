import { useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { Plus, Trash2 } from "lucide-react"
import { useLoaderData, useRevalidator } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { useToast } from "@/components/ui/use-toast"

import { useScript } from "../hooks/use-script"

export const BlockConfig = () => {
  const block = useLoaderData() as IScript
  const [envMap, setEnvMap] = useState<Record<string, string>>(
    block.env_map || {}
  )
  const [newEnvKey, setNewEnvKey] = useState("")
  const [newEnvValue, setNewEnvValue] = useState("")
  const [bulkEnvInput, setBulkEnvInput] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const revalidator = useRevalidator()
  const { toast } = useToast()
  const { updateScript } = useScript()

  const handleSave = async () => {
    await updateScript({
      ...block,
      env_map: envMap,
    })
    revalidator.revalidate()
    toast({
      title: "Block Updated Successfully",
    })
  }

  const handleAddEnv = () => {
    if (!newEnvKey.trim()) return
    setEnvMap({
      ...envMap,
      [newEnvKey]: newEnvValue,
    })
    setNewEnvKey("")
    setNewEnvValue("")
  }

  const handleRemoveEnv = (key: string) => {
    const newEnvMap = { ...envMap }
    delete newEnvMap[key]
    setEnvMap(newEnvMap)
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
    setBulkEnvInput("")
    setIsDialogOpen(false)
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
                  value={value}
                  onChange={(e) =>
                    setEnvMap({
                      ...envMap,
                      [key]: e.target.value,
                    })
                  }
                  className="w-[200px]"
                />
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
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t p-6">
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
          <Button onClick={handleSave}>Save</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
