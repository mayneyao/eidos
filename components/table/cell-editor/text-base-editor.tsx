import { useEffect, useState } from "react"

import { Input } from "@/components/ui/input"

interface ITextBaseEditorProps {
  value: string
  onChange: (value: string) => void
  type?: "text" | "number" | "url"
  isEditing: boolean
}
export const TextBaseEditor = ({
  value,
  isEditing,
  onChange,
  type = "text",
}: ITextBaseEditorProps) => {
  const [_value, setValue] = useState(value)
  useEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  if (!isEditing) {
    return <div className="flex h-full w-full items-center">{_value}</div>
  }
  return (
    <div className="w-full">
      <Input
        value={_value}
        type={type}
        onChange={(e) => {
          setValue(e.target.value)
        }}
      ></Input>
    </div>
  )
}
