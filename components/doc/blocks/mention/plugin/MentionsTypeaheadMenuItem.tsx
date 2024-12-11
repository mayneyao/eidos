import { cn } from "@/lib/utils"
import { ItemIcon } from "@/components/sidebar/item-tree"

import { MentionTypeaheadOption } from "./MentionTypeaheadOption"

export function MentionsTypeaheadMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
  onMouseEnter: () => void
  option: MentionTypeaheadOption
}) {
  let className = "item"
  if (isSelected) {
    className += " selected"
  }
  const result = option.rawData
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={cn("flex gap-1", className)}
      ref={option.setRefElement}
      role="option"
      aria-selected={isSelected}
      id={"typeahead-item-" + index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className="grid w-[20px] shrink-0 place-items-center">
        {option.rawData.icon ? (
          option.rawData.icon
        ) : (
          <ItemIcon type={result.type} className="h-4 w-4" />
        )}
      </span>
      <span className="text truncate" title={option.name}>
        {option.name || "Untitled"}
      </span>
    </li>
  )
}
