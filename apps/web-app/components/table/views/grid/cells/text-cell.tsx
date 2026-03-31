import * as React from "react"
import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid"
import { GridCellKind, drawTextCell } from "@glideapps/glide-data-grid"

interface TextCellProps {
  readonly kind: "text-cell"
  readonly text: string
}

export type TextGridCell = CustomCell<TextCellProps>

const renderer: CustomRenderer<TextGridCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is TextGridCell =>
    (cell.data as any).kind === "text-cell",
  draw: (args, cell) => {
    const { text } = cell.data
    drawTextCell(args, text, cell.contentAlign)
    return true
  },
  provideEditor: () => (p) => {
    const [value, setValue] = React.useState(p.value.data.text)
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)

    // Auto-adjust height
    React.useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
        textareaRef.current.style.height =
          textareaRef.current.scrollHeight + "px"
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        p.onChange({
          ...p.value,
          data: {
            ...p.value.data,
            text: value,
          },
          copyData: value,
        })
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        p.onFinishedEditing(undefined, [0, 0])
      }
    }

    return (
      <div className="w-full py-[6px]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            p.onChange({
              ...p.value,
              data: {
                ...p.value.data,
                text: value,
              },
              copyData: value,
            })
          }}
          className="gdg-input w-full min-h-[21px] resize-none overflow-hidden border-none bg-transparent p-0 text-[var(--gdg-editor-font-size)] font-[var(--gdg-font-family)] text-[var(--gdg-text-dark)] focus:outline-hidden"
          autoFocus
          rows={1}
        />
      </div>
    )
  },
  onPaste: (v, d) => {
    return {
      ...d,
      text: v,
    }
  },
  onDelete: (d) => {
    return {
      ...d,
      data: {
        ...d.data,
        text: "",
      },
    }
  },
}

export default renderer
