import { MouseEventHandler, useCallback } from "react"
import { $patchStyleText } from "@lexical/selection"
import { $getSelection, $isRangeSelection, LexicalEditor } from "lexical"
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
    <div className="w-full p-2">
      <h2>FontColor</h2>
      <div className="flex gap-1 p-2">
        {fgColors.map(({ value: color }, index) => {
          return (
            <div
              onMouseDownCapture={handleFontColorSelect}
              data-color={color}
              style={
                index === 0
                  ? {
                      backgroundColor: theme === "light" ? "black" : "white",
                    }
                  : { backgroundColor: color }
              }
              className={cn(
                "h-[32px] w-[32px] rounded-[32px]",
                index === 0 &&
                  "border border-black bg-black dark:border-white dark:bg-white"
              )}
            ></div>
          )
        })}
      </div>
      <h2>BackgroundColor</h2>
      <div className="flex gap-1 p-2">
        {bgColors.map(({ value: color }, index) => {
          return (
            <div
              onMouseDownCapture={handleBgColorSelect}
              style={{ backgroundColor: color }}
              className={cn(
                "h-[32px] w-[32px] rounded-[32px]",
                index === 0 && "border border-black dark:border-white"
              )}
            ></div>
          )
        })}
      </div>
    </div>
  )
}
