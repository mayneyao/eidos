import {
  ArrowLeft,
  ArrowUpRight,
  Settings,
  Trash2
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { ContextMenuItem } from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useExtensionNavigate } from "@/hooks/use-extension-navigate"
import { getBlockIdFromUrl } from "@/lib/utils"

export const BlockContextMenu = ({
  url,
  setUrl,
}: {
  url: string
  setUrl: (url: string) => void
}) => {
  const [params, setParams] = useState<Array<{ key: string; value: string }>>(
    []
  )
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useExtensionNavigate()

  const initializeParams = () => {
    const _url = new URL(url)
    const initialParams: Array<{ key: string; value: string }> = []
    _url.searchParams.forEach((value, key) => {
      initialParams.push({ key, value })
    })
    setParams(initialParams)
  }

  const handleConfigBlock = (e: Event) => {
    e.preventDefault()
    initializeParams()
    setIsOpen(true)
  }

  const handleSaveConfig = () => {
    const _url = new URL(url)
    Array.from(_url.searchParams.keys()).forEach((key) => {
      _url.searchParams.delete(key)
    })
    params.forEach(({ key, value }) => {
      if (key && value) {
        _url.searchParams.set(key, value)
      }
    })
    setUrl(_url.toString())
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
    navigate(url)
  }

  const handleOpenInNewWindow = (e: Event) => {
    const [id, space] = getBlockIdFromUrl(url).split("@")
    let newUrl = `/${space}/standalone-blocks/${id}`
    // add params to the url
    const _url = new URL(url)
    const searchParams = _url.searchParams.toString()
    if (searchParams) {
      newUrl += `?${searchParams}`
    }
    window.open(newUrl)
  }

  return (
    <>
      <ContextMenuItem onSelect={handleGoToBlock}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        <span>Go to Block</span>
      </ContextMenuItem>

      <ContextMenuItem onSelect={handleOpenInNewWindow}>
        <ArrowUpRight className="mr-2 h-4 w-4" />
        <span>Open Standalone</span>
      </ContextMenuItem>

      <ContextMenuItem onSelect={handleConfigBlock}>
        <Settings className="mr-2 h-4 w-4" />
        <span>Config</span>
      </ContextMenuItem>
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
