import { Calendar, CheckSquare, Clock, Hash, Tags, Type } from "lucide-react"

import type { PropertyType } from "./types"

interface PropertyIconProps {
  type: PropertyType
  className?: string
}

export const PropertyIcon: React.FC<PropertyIconProps> = ({
  type,
  className = "w-3 h-3",
}) => {
  switch (type) {
    case "text":
      return <Type className={className} />
    case "number":
      return <Hash className={className} />
    case "date":
      return <Calendar className={className} />
    case "datetime":
      return <Clock className={className} />
    case "boolean":
      return <CheckSquare className={className} />
    case "tags":
      return <Tags className={className} />
    default:
      return <Type className={className} />
  }
}
