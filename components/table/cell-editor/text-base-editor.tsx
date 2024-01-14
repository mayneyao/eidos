import { useDebounceFn } from "ahooks"
import { useEffect, useState } from "react"

import { Input } from "@/components/ui/input"

interface ITextBaseEditorProps {
  value: string
  onChange: (value: string) => void
  type: "text" | "number" | "url"
}
export const TextBaseEditor = ({
  value,
  onChange,
  type,
}: ITextBaseEditorProps) => {
  const [_value, setValue] = useState(value)

  const { run } = useDebounceFn(onChange, { wait: 500 })

  useEffect(() => {
    run(_value)
  }, [_value, run])

  return (
    <div>
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
