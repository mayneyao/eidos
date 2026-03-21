import { useRef, useState } from "react"
import { useDrop, useSize } from "ahooks"
import { useTranslation } from "react-i18next"
import { ImageIcon } from "lucide-react"

import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { BlockRenderer } from "@/components/block-renderer/block-renderer"
import { FinderDialog } from "@/components/finder"
import { useMblock } from "@/apps/web-app/hooks/use-mblock"
import { useNode } from "@/apps/web-app/hooks/use-nodes"
import { getDragFileInfo } from "@/lib/file"

export const NodeCover = (props: { node: ITreeNode }) => {
  const { node } = props
  const [open, setOpen] = useState(false)
  const [finderOpen, setFinderOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const { t } = useTranslation()
  const ref = useRef(null)
  const size = useSize(ref)
  const dropRef = useRef(null)

  const { updateCover } = useNode()

  const handleSelect = async (url: string) => {
    await updateCover(node?.id!, url)
    setOpen(false)
  }

  const handleFinderSelect = (paths: string[]) => {
    if (paths.length > 0) {
      updateCover(node?.id!, paths[0])
    }
    setFinderOpen(false)
    setOpen(false)
  }

  const handleRemove = async () => {
    await updateCover(node?.id!, "")
    setOpen(false)
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
    <>
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
          <PopoverContent className="w-auto p-2">
            <div className="flex flex-col gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => setFinderOpen(true)}
              >
                <ImageIcon className="mr-2 h-4 w-4" />
                Select from Files
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-destructive"
                onClick={handleRemove}
              >
                Remove Cover
              </Button>
            </div>
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
              blockId={block?.id ?? ""}
              code={block?.ts_code ?? ""}
              compiledCode={block?.code ?? ""}
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
      <FinderDialog
        open={finderOpen}
        onOpenChange={setFinderOpen}
        title="Select Cover Image"
        confirmLabel="Select"
        onSelect={handleFinderSelect}
        selectMode="file"
        allowMultiple={false}
        accept="image/*"
      />
    </>
  )
}
