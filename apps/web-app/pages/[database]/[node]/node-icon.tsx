import type { DOMAttributes } from "react"
import { useEffect, useState } from "react"
import data from "@emoji-mart/data"
import Picker from "@emoji-mart/react"
import { init } from "emoji-mart"
import { useTranslation } from "react-i18next"

import { isInkServiceMode } from "@/lib/env"
import { useNode } from "@/apps/web-app/hooks/use-nodes"
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

  const { t } = useTranslation()
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

  const renderIcon = (iconValue: string) => {
    if (
      iconValue.startsWith("http://") ||
      iconValue.startsWith("https://") ||
      iconValue.startsWith("data:image/")
    ) {
      return (
        <div
          style={{ width: props.size || "2em", height: props.size || "2em" }}
          className="flex items-center justify-center"
        >
          <img
            src={iconValue}
            alt="icon"
            className="w-full h-full rounded-sm object-contain"
          />
        </div>
      )
    }
    return <em-emoji native={iconValue} size={props.size || "2em"}></em-emoji>
  }

  if (props.disabled || isInkServiceMode) {
    // just show the icon
    return (
      <>
        {icon ? (
          <div className={props.className}>{renderIcon(icon)}</div>
        ) : (
          props.customTrigger
        )}
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="[&>svg]:!size-5" tabIndex={-1}>
        {icon ? (
          <div className={props.className}>{renderIcon(icon)}</div>
        ) : (
          props.customTrigger
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto border-none p-0 outline-hidden">
        <div className="relative">
          <Picker data={data} onEmojiSelect={handleIconSelect} />
          <Button
            className="absolute bottom-3 right-2 z-50"
            size="sm"
            onClick={handleRemoveIcon}
          >
            {t("common.remove")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
