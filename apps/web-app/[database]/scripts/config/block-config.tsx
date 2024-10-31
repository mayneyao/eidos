import { useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useLoaderData, useRevalidator } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"

import { useScript } from "../hooks/use-script"

export const BlockConfig = () => {
  const block = useLoaderData() as IScript
  const [envMap, setEnvMap] = useState<Record<string, string>>(
    block.env_map || {}
  )
  const [newEnvKey, setNewEnvKey] = useState("")
  const [newEnvValue, setNewEnvValue] = useState("")

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
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemoveEnv(key)}
                >
                  Remove
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
              <Button onClick={handleAddEnv}>Add</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button onClick={handleSave}>Update</Button>
      </div>
    </div>
  )
}
