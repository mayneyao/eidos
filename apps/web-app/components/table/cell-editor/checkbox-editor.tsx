import { useState } from "react"

import useChangeEffect from "../hooks/use-change-effect"

interface ICheckboxEditorProps {
  value: boolean
  onChange: (value: boolean) => void
  isEditing: boolean
  onFinishEditing?: () => void
}

const CustomCheckbox = ({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) => {
  return (
    <div
      className="cursor-pointer select-none"
      onClick={() => onChange(!checked)}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" className="border-0">
        {/* Checkbox border and background */}
        <rect
          x="1"
          y="1"
          width="14"
          height="14"
          rx="2"
          ry="2"
          fill={checked ? "#6b7280" : "transparent"}
          stroke="#d1d5db"
          strokeWidth="1"
          className={checked ? "fill-gray-500" : "fill-transparent"}
        />
        {/* Checkmark */}
        {checked && (
          <path
            d="M4.5 8.5L7 11L11.5 5.5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </svg>
    </div>
  )
}

export const CheckboxEditor = ({
  value,
  onChange,
  onFinishEditing,
}: ICheckboxEditorProps) => {
  const [_value, setValue] = useState<boolean>(value)

  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const newValue = !_value
      setValue(newValue)
      onFinishEditing?.()
    }
  }

  return (
    <div
      className="flex h-full w-full items-center px-2"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <CustomCheckbox
        checked={Boolean(_value)}
        onChange={(checked: boolean) => {
          setValue(checked)
          onFinishEditing?.()
        }}
      />
    </div>
  )
}
