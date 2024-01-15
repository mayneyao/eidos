import { useEffect, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"

interface ICheckboxEditorProps {
  value: boolean
  onChange: (value: boolean) => void
  isEditing: boolean
}

export const CheckboxEditor = ({ value, onChange }: ICheckboxEditorProps) => {
  const [_value, setValue] = useState<boolean>(value)

  useEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  return (
    <div>
      <Checkbox
        checked={Boolean(_value)}
        onCheckedChange={(checked: boolean) => {
          setValue(checked)
        }}
      ></Checkbox>
    </div>
  )
}
