import { cn } from "@/lib/utils"
import { SelectField, type SelectOption } from "@/packages/core/fields/select"
type Theme = "light" | "dark" | "system"

/**
 * Get container styles based on layout mode
 * @param layout - Layout mode
 * @param isEditing - Whether in editing state
 * @param disabled - Whether the editor is disabled (readonly)
 * @returns CSS class string
 */
export function getLayoutClasses(
  layout: "fill" | "flow" | "inline" = "flow",
  isEditing: boolean = false,
  disabled: boolean = false
): string {
  const baseClasses = "flex items-center"

  switch (layout) {
    case "fill":
      // Fill mode: absolute positioning to fill parent container
      return cn(
        baseClasses,
        "absolute inset-0",
        "px-2",
        isEditing && "bg-muted/30 rounded-xs"
      )
    case "inline":
      // Inline mode: width adapts to content
      return cn(
        baseClasses,
        "inline-flex",
        "px-2",
        isEditing && "bg-muted/30 rounded-xs"
      )
    case "flow":
    default:
      // Flow mode: adaptive width, relative positioning
      // No padding when disabled (controlled by parent), px-2 when editable (for editing state visual)
      return cn(
        baseClasses,
        "relative w-full h-full",
        !disabled && "px-2",
        isEditing && "bg-muted/30 rounded-xs"
      )
  }
}

/**
 * Get editor wrapper styles (for input/textarea etc.)
 * @param layout - Layout mode
 * @returns CSS class string
 */
export function getInputWrapperClasses(
  layout: "fill" | "flow" | "inline" = "flow"
): string {
  switch (layout) {
    case "fill":
      return "w-full h-full"
    case "inline":
      return "w-auto"
    case "flow":
    default:
      return "w-full"
  }
}

// Empty value display component
export const EmptyValue = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "text-muted-foreground italic text-xs leading-none",
      className
    )}
  >
    Empty
  </span>
)

// Select option item component
export const SelectOptionItem = ({
  option,
  theme,
}: {
  option: SelectOption
  theme?: Theme
}) => {
  const bgColor = SelectField.getColorValue(option.color, theme as any)
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-[150px]"
      style={{ backgroundColor: bgColor }}
    >
      {option.name}
    </span>
  )
}
