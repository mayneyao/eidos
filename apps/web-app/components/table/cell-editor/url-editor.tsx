import { useState } from "react"

import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue } from "./common"

interface IUrlEditorProps {
  value: string | null
  onChange: (value: string | null) => void
  isEditing: boolean
  onFinishEditing?: () => void
}

export const UrlEditor = ({
  value,
  isEditing,
  onChange,
  onFinishEditing,
}: IUrlEditorProps) => {
  const [_value, setValue] = useState(value)

  useChangeEffect(() => {
    onChange(_value || null)
  }, [_value, onChange])

  if (!isEditing) {
    return (
      <div className="flex h-full w-full items-center truncate px-2">
        {_value ? (
          <a
            href={_value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80 truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {_value}
          </a>
        ) : (
          <EmptyValue />
        )}
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <input
        type="url"
        value={_value || ""}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.stopPropagation()
            onFinishEditing?.()
          }
        }}
        className="w-full h-full px-2 text-sm border-none rounded focus:outline-hidden bg-muted focus:bg-accent"
        placeholder="Enter URL..."
        autoFocus
      />
    </div>
  )
}
