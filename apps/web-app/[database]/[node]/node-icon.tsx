import { DOMAttributes, useEffect, useState } from "react"
import data from "@emoji-mart/data"
import Picker from "@emoji-mart/react"
import { init } from "emoji-mart"

import { isInkServiceMode } from "@/lib/env"
import { useNode } from "@/hooks/use-nodes"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

init({ data })

type CustomElement<T> = Partial<T & DOMAttributes<T> & { children: any }>

type Emoji = {
  id: string
  shortCode: string
  native: string
  size: string
  fallback: string
  set: string
  skin: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      ["em-emoji"]: CustomElement<Emoji>
    }
  }
}

export const NodeIconEditor = (props: {
  icon?: string
  nodeId: string
  size?: string
  customTrigger?: React.ReactNode
  className?: string
  disabled?: boolean
}) => {
  const [icon, setIcon] = useState(props.icon)
  const { updateIcon } = useNode()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setIcon(props.icon)
  }, [props.icon])

  const handleIconSelect = (data: Emoji) => {
    setIcon(data.native)
    updateIcon(props.nodeId, data.native)
    setOpen(false)
  }
  const handleRemoveIcon = () => {
    setIcon("")
    updateIcon(props.nodeId, "")
    setOpen(false)
  }

  if (props.disabled || isInkServiceMode) {
    // just show the icon
    return (
      <>
        {icon ? (
          <div className={props.className}>
            <em-emoji native={icon} size={props.size || "2em"}></em-emoji>
          </div>
        ) : (
          props.customTrigger
        )}
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        {icon ? (
          <div className={props.className}>
            <em-emoji native={icon} size={props.size || "2em"}></em-emoji>
          </div>
        ) : (
          props.customTrigger
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto border-none p-0 outline-none">
        <div className="relative">
          <Picker data={data} onEmojiSelect={handleIconSelect} />
          <Button
            className="absolute bottom-3 right-2 z-50"
            size="sm"
            onClick={handleRemoveIcon}
          >
            Remove
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
