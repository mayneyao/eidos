import { useRef, useState } from "react"
import { useDrop, useSize } from "ahooks"
import { useTranslation } from "react-i18next"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { cn } from "@/lib/utils"
import { useMblock } from "@/hooks/use-mblock"
import { useNode } from "@/hooks/use-nodes"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { BlockRenderer } from "@/components/block-renderer/block-renderer"
import { getDragFileInfo } from "@/components/file-manager/helper"
import { FileSelector } from "@/components/file-selector"

export const NodeCover = (props: { node: ITreeNode }) => {
  const { node } = props
  const [open, setOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const { t } = useTranslation()
  const ref = useRef(null)
  const size = useSize(ref)
  const dropRef = useRef(null)

  const { updateCover } = useNode()
  const handleSelect = async (url: string, close = false) => {
    await updateCover(node?.id!, url)
    close && setOpen(false)
  }
  const handleRemove = async () => {
    await updateCover(node?.id!, "")
  }
  const isColor = node.cover?.startsWith("color://")

  useDrop(dropRef, {
    onText: (text, e) => {
      const file = getDragFileInfo(text)
      if (file && file.type === "image") {
        handleSelect(file.url)
      }
      setIsHovering(false)
    },
    onDragEnter: () => setIsHovering(true),
    onDragLeave: () => setIsHovering(false),
  })
  const isBlock = node.cover?.startsWith("block://")

  const blockId = node.cover?.replace("block://", "")
  const block = useMblock(blockId)
  return (
    <div
      className={cn("group relative", {
        ring: isHovering,
      })}
      ref={dropRef}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="absolute right-[24%] opacity-0 group-hover:opacity-100">
            <Button size="sm">{t("doc.changeCover")}</Button>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <FileSelector
            onSelected={handleSelect}
            onRemove={handleRemove}
            onlyImage
            showBlock
          />
        </PopoverContent>
      </Popover>
      {isBlock ? (
        <div
          className="inset-0 overflow-hidden"
          ref={ref}
          style={{
            backgroundSize: "cover",
            backgroundPosition: "center",
            objectFit: "cover",
            height: "30vh",
            width: "100%",
          }}
        >
          <BlockRenderer
            code={block?.ts_code ?? ""}
            compiledCode={block?.code ?? ""}
            env={block?.env_map}
            bindings={block?.bindings}
            width={size?.width}
            height={size?.height}
          />
        </div>
      ) : isColor ? (
        <div
          className={cn(node.cover?.replace("color://", ""), "inset-0")}
          style={{
            objectFit: "cover",
            height: "30vh",
            width: "100%",
          }}
        />
      ) : (
        <img
          className="trigger"
          src={node.cover}
          alt={t("doc.coverImage")}
          style={{
            backgroundSize: "cover",
            backgroundPosition: "center",
            objectFit: "cover",
            height: "30vh",
            width: "100%",
          }}
        />
      )}
    </div>
  )
}
