import type { FieldType } from "@/packages/core/fields/const"

import { makeHeaderIcons } from "./header-icons"

const icons = makeHeaderIcons(18)

export const FieldIcon = ({
  type,
  className,
}: {
  type: FieldType
  className?: string
}) => {
  const iconSvgString = icons[type]({
    bgColor: "#aaa",
    fgColor: "currentColor",
  })

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{
        __html: iconSvgString,
      }}
    ></span>
  )
}
