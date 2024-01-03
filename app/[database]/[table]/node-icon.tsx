import { DOMAttributes, useEffect, useState } from "react"
import data from "@emoji-mart/data"
import Picker from "@emoji-mart/react"
import { init } from "emoji-mart"

import { useNode } from "@/hooks/use-nodes"
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

  useEffect(() => {
    setIcon(props.icon)
  }, [props.icon])

  const handleIconSelect = (data: Emoji) => {
    setIcon(data.native)
    updateIcon(props.nodeId, data.native)
  }

  if (props.disabled) {
    // just show the icon
    return (
      <div className="inline-block">
        {icon ? (
          <div className={props.className}>
            <em-emoji native={icon} size={props.size || "2em"}></em-emoji>
          </div>
        ) : (
          props.customTrigger
        )}
      </div>
    )
  }
  return (
    <Popover>
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
        <Picker data={data} onEmojiSelect={handleIconSelect} />
      </PopoverContent>
    </Popover>
  )
}
