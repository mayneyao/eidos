import { useCallback, type MouseEventHandler } from "react"
import { $patchStyleText } from "@lexical/selection"
import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"

import { bgColors, fgColors } from "../const"

// https://coolors.co/ffadad-ffd6a5-fdffb6-caffbf-9bf6ff-a0c4ff-bdb2ff-ffc6ff-fffffc
// --melon: #ffadadff;
// --sunset: #ffd6a5ff;
// --cream: #fdffb6ff;
// --tea-green: #caffbfff;
// --electric-blue: #9bf6ffff;
// --jordy-blue: #a0c4ffff;
// --periwinkle: #bdb2ffff;
// --mauve: #ffc6ffff;
// --baby-powder: #fffffcff;

// font color

export const ColorPicker = ({
  activeEditor,
}: {
  activeEditor: LexicalEditor
}) => {
  const applyStyleText = useCallback(
    (styles: Record<string, string>) => {
      activeEditor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          console.log(selection)
          $patchStyleText(selection, styles)
        }
      })
    },
    [activeEditor]
  )

  const onFontColorSelect = useCallback(
    (value: string) => {
      applyStyleText({ color: value })
    },
    [applyStyleText]
  )

  const onBgColorSelect = useCallback(
    (value: string) => {
      applyStyleText({ "background-color": value })
    },
    [applyStyleText]
  )

  const handleBgColorSelect: MouseEventHandler<HTMLDivElement> = (e) => {
    onBgColorSelect(e.currentTarget.style.backgroundColor)
    e.stopPropagation()
    e.preventDefault()
  }

  const handleFontColorSelect: MouseEventHandler<HTMLDivElement> = (e) => {
    onFontColorSelect(e.currentTarget.dataset.color!)
    e.stopPropagation()
    e.preventDefault()
  }

  const { theme } = useTheme()
  return (
    <div className="w-full p-3">
      <div className="space-y-3">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2">
            Text Color
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {fgColors.map(({ value: color }, index) => {
              return (
                <div
                  onMouseDownCapture={handleFontColorSelect}
                  data-color={color}
                  key={`font-color-${color}`}
                  style={
                    index === 0
                      ? {
                          backgroundColor:
                            theme === "light" ? "black" : "white",
                        }
                      : { backgroundColor: color }
                  }
                  className={cn(
                    "h-6 w-6 rounded-full border-2 border-transparent hover:border-border transition-colors",
                    index === 0 && "border-border"
                  )}
                  title={index === 0 ? "Default" : color}
                />
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2">
            Background
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {bgColors.map(({ value: color }, index) => {
              return (
                <div
                  onMouseDownCapture={handleBgColorSelect}
                  style={{ backgroundColor: color }}
                  key={`bg-color-${color}`}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 border-transparent hover:border-border transition-colors",
                    index === 0 && "border-border"
                  )}
                  title={index === 0 ? "Default" : color}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
