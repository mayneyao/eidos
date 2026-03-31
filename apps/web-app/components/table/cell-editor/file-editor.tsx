import { useEffect, useRef, useState } from "react"
import { useClickAway } from "ahooks"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  FileCellEditor,
  type FileCell,
} from "@/components/table/views/grid/cells/file/file-cell"

import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue, getLayoutClasses } from "./common"
import type { CellEditorProps } from "./types"
import { useCellEditor } from "./use-cell-editor"

const FileEditor_ = FileCellEditor as any

interface IFileEditorProps extends CellEditorProps<FileCell> {}

export const FileEditor = ({
  value,
  onChange,
  isEditing,
  onFinishEditing,
  onCancelEditing,
  layout = "flow",
  disabled = false,
}: IFileEditorProps) => {
  const [_value, setValue] = useState<
    FileCell & {
      className: string
    }
  >({
    ...value,
    className: "p-2 w-[450px] max-h-[500px] overflow-auto",
  })
  const editorRef = useRef<HTMLDivElement>(null)

  const { isActuallyEditing, handleKeyDown, finishEditing, cancelEditing } =
    useCellEditor({
      isEditing,
      onFinishEditing,
      onCancelEditing,
      originalValue: value,
      setValue: (v) => setValue({ ...v, className: _value.className }),
    })

  useClickAway(
    (e) => {
      const res = document.querySelectorAll(".click-outside-ignore")
      if (Array.from(res).some((node) => node.contains(e.target as Node))) {
        return
      }
      if (editorRef.current?.contains(e.target as Node)) {
        return
      }
      finishEditing()
    },
    editorRef,
    ["mousedown", "touchstart"]
  )

  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  useEffect(() => {
    setValue({
      ...value,
      className: "p-2 w-[450px] max-h-[500px] overflow-auto",
    })
  }, [value])

  const containerClasses = getLayoutClasses(layout, isActuallyEditing, disabled)

  // Use smaller thumbnail height in flow mode
  const imageHeightClass = layout === "flow" ? "h-6" : "h-12"

  return (
    <div
      className={containerClasses}
      ref={editorRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <Popover open={isActuallyEditing}>
        <PopoverTrigger asChild>
          <div
            className="flex items-center gap-1 overflow-hidden leading-none w-full h-full"
            onClick={() => {}}
          >
            {_value?.data.displayData.length ? (
              _value.data.displayData.map((url, index) => {
                return (
                  <img
                    src={url}
                    alt=""
                    key={`${url}-${index}`}
                    className={`${imageHeightClass} w-auto object-cover rounded block not-prose my-0`}
                  />
                )
              })
            ) : (
              <EmptyValue />
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="click-outside-ignore w-auto p-0 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
          align="start"
        >
          <FileEditor_ value={_value} onChange={setValue} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
