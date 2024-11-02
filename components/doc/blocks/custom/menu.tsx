import { useState } from "react"
import { $getNodeByKey, LexicalEditor, NodeKey } from "lexical"
import { ArrowUpRight, Settings, Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useExtensionNavigate } from "@/hooks/use-extension-navigate"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

import { $isCustomBlockNode } from "./node"

export const CustomBlockMenu = ({
  nodeKey,
  editor,
}: {
  nodeKey: NodeKey | null
  editor: LexicalEditor
}) => {
  const [params, setParams] = useState<Array<{ key: string; value: string }>>(
    []
  )
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useExtensionNavigate()

  const initializeParams = () => {
    editor.update(() => {
      if (!nodeKey) return
      const node = $getNodeByKey(nodeKey)
      if (!$isCustomBlockNode(node)) return

      const url = new URL(node.__url)
      const initialParams: Array<{ key: string; value: string }> = []
      url.searchParams.forEach((value, key) => {
        initialParams.push({ key, value })
      })
      setParams(initialParams)
    })
  }

  const handleConfigBlock = (e: Event) => {
    e.preventDefault()
    initializeParams()
    setIsOpen(true)
  }

  const handleSaveConfig = () => {
    editor.update(() => {
      if (!nodeKey) return
      const node = $getNodeByKey(nodeKey)
      if (!$isCustomBlockNode(node)) return

      const url = new URL(node.__url)
      Array.from(url.searchParams.keys()).forEach((key) => {
        url.searchParams.delete(key)
      })
      params.forEach(({ key, value }) => {
        if (key && value) {
          url.searchParams.set(key, value)
        }
      })
      node.setUrl(url.toString())
    })
    setIsOpen(false)
    setParams([])
  }

  const addParam = () => {
    setParams([...params, { key: "", value: "" }])
  }

  const removeParam = (index: number) => {
    setParams(params.filter((_, i) => i !== index))
  }

  const updateParam = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const newParams = [...params]
    newParams[index][field] = value
    setParams(newParams)
  }

  const handleGoToBlock = (e: Event) => {
    e.preventDefault()
    editor.update(() => {
      if (!nodeKey) return
      const node = $getNodeByKey(nodeKey)
      if (!$isCustomBlockNode(node)) return
      navigate(node.__url)
    })
  }

  return (
    <>
      <DropdownMenuItem onSelect={handleGoToBlock}>
        <ArrowUpRight className="mr-2 h-4 w-4" />
        <span>Go to Block</span>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={handleConfigBlock}>
        <Settings className="mr-2 h-4 w-4" />
        <span>Config</span>
      </DropdownMenuItem>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Config Params</DialogTitle>
            <DialogDescription>
              Config the params for the block, this will affect block rendering.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {params.map((param, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="key"
                  value={param.key}
                  onChange={(e) => updateParam(index, "key", e.target.value)}
                />
                <Input
                  placeholder="value"
                  value={param.value}
                  onChange={(e) => updateParam(index, "value", e.target.value)}
                />
                <Button variant="outline" onClick={() => removeParam(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button onClick={addParam} variant="outline">
              Add Param
            </Button>
          </div>
          <Button onClick={handleSaveConfig}>Save</Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
