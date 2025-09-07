import { useState } from "react"

import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue } from "./common"

interface ITextBaseEditorProps {
  value: string | null
  onChange: (value: string | null) => void
  type?: "text" | "number" | "url"
  isEditing: boolean
  onFinishEditing?: () => void
}
export const TextBaseEditor = ({
  value,
  isEditing,
  onChange,
  type = "text",
  onFinishEditing,
}: ITextBaseEditorProps) => {
  const [_value, setValue] = useState(value)

  useChangeEffect(() => {
    onChange(_value || null)
  }, [_value, onChange])

  if (!isEditing) {
    if (type === "number") {
      return (
        <div className="flex h-full w-full items-center truncate px-2">
          {_value}
        </div>
      )
    }
    return (
      <div className="flex h-full w-full items-center truncate px-2">
        {_value?.length ? _value : <EmptyValue />}
      </div>
    )
  }
  return (
    <div className="w-full h-full">
      <input
        value={_value || ""}
        type={type}
        onChange={(e) => {
          setValue(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.stopPropagation()
            onFinishEditing?.()
          }
        }}
        className="w-full h-full px-2 text-sm border-none rounded focus:outline-none bg-muted focus:bg-accent"
        placeholder="Enter value..."
        autoFocus
      />
    </div>
  )
}
