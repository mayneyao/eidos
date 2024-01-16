import { useEffect, useRef, useState } from "react"
import { useClickAway } from "ahooks"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  FileCell,
  FileCellEditor,
} from "@/components/grid/cells/file/file-cell"

import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue } from "./common"

const FileEditor_ = FileCellEditor as any

interface IFileEditorProps {
  value: FileCell
  onChange: (value: FileCell) => void
  isEditing: boolean
}

export const FileEditor = ({
  value,
  onChange,
}: //   isEditing,
IFileEditorProps) => {
  const [_value, setValue] = useState<
    FileCell & {
      className: string
    }
  >({
    ...value,
    className: "shadow-md p-2 bg-white w-[450px] max-h-[500px] overflow-auto",
  })
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const editorRef = useRef<HTMLDivElement>(null)

  useClickAway(
    (e) => {
      const res = document.querySelectorAll(".click-outside-ignore")
      if (Array.from(res).some((node) => node.contains(e.target as Node)))
        return
      setIsEditing(false)
    },
    editorRef,
    ["mousedown", "touchstart"]
  )

  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  if (!isEditing) {
    return (
      <div
        className="flex h-full w-full items-center gap-2 py-1"
        onClick={() => setIsEditing(true)}
      >
        {_value?.data.displayData.length ? (
          _value.data.displayData.map((url) => {
            return <img src={url} alt="" key={url} className="h-full w-auto" />
          })
        ) : (
          <EmptyValue />
        )}
      </div>
    )
  }
  return (
    <div className="h-full w-full" ref={editorRef}>
      <Popover open={isEditing} onOpenChange={setIsEditing}>
        <PopoverTrigger>
          <div />
        </PopoverTrigger>
        <PopoverContent
          className="click-outside-ignore w-auto p-0"
          align="start"
        >
          <FileEditor_ value={_value} onChange={setValue} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
