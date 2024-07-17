import { useRef, type FC } from "react"
import type { Identifier, XYCoord } from "dnd-core"
import { FileIcon, MoreHorizontal } from "lucide-react"
import { useDrag, useDrop } from "react-dnd"

import { getFileType } from "@/lib/mime/mime"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

enum ItemTypes {
  CARD = "card",
}

const style = {
  padding: "0.5rem 1rem",
  transition: "all 0.5s ease",
  transform: "translate3d(0,0,0)",
}

export interface CardProps {
  id: any
  text: string
  originalUrl: string
  index: number
  moveCard: (dragIndex: number, hoverIndex: number) => void
  setCurrentPreviewIndex: (i: number) => void
  deleteByUrl: (index: number) => void
}

interface DragItem {
  index: number
  id: string
  type: string
}

const FileRender = ({
  url,
  originalUrl,
}: {
  url: string
  originalUrl: string
}) => {
  const fileType = getFileType(originalUrl)
  switch (fileType) {
    case "image":
      return (
        <img
          src={url}
          alt=""
          className="max-h-[160px] cursor-pointer object-contain"
        />
      )
    case "audio":
      return (
        <audio
          src={originalUrl}
          className="cursor-pointer object-contain"
          controls
        />
      )
    case "video":
      return (
        <video
          src={originalUrl}
          className="max-h-[160px] cursor-pointer object-contain"
          controls
        />
      )
    default:
      return (
        <div
          className="flex h-10 cursor-pointer items-center gap-2"
          title={originalUrl}
        >
          <FileIcon className="h-5 w-5 shrink-0"/>
          <p className="truncate">{originalUrl}</p>
        </div>
      )
  }
}

export const Card: FC<CardProps> = ({
  id,
  text,
  index,
  moveCard,
  originalUrl,
  deleteByUrl,
  setCurrentPreviewIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: Identifier | null }
  >({
    accept: ItemTypes.CARD,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      }
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return
      }
      const dragIndex = item.index
      const hoverIndex = index

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect()

      // Get vertical middle
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2

      // Determine mouse position
      const clientOffset = monitor.getClientOffset()

      // Get pixels to the top
      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return
      }

      // Time to actually perform the action
      moveCard(dragIndex, hoverIndex)

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex
    },
  })

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CARD,
    item: () => {
      return { id, index }
    },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  const opacity = isDragging ? 0.5 : 1
  drag(drop(ref))

  const handleClickViewOriginal = () => {
    window.open(originalUrl, "_blank")
  }

  return (
    <div
      ref={ref}
      style={{ ...style, opacity }}
      data-handler-id={handlerId}
      className="space-between flex items-start justify-between hover:bg-secondary"
    >
      <div
        onClick={() => setCurrentPreviewIndex(index)}
        className="max-w-[80%]"
      >
        <FileRender url={text} originalUrl={originalUrl} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="click-outside-ignore h-[32px]">
          <MoreHorizontal className="m-1 h-4 w-4" />
        </DropdownMenuTrigger>
        {/* z-index 10000 > gdg editor 9999 */}
        <DropdownMenuContent className="click-outside-ignore z-[10000]">
          <DropdownMenuItem onClick={() => setCurrentPreviewIndex(index)}>
            Fullscreen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleClickViewOriginal}>
            View Original
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => deleteByUrl(index)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
