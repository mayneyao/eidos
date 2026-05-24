import React from "react"
import type { LLMProviderType } from "@/packages/ai/helper"
import { providerIconMap } from "./provider-icons"

interface ProviderIconProps {
  type: LLMProviderType
  className?: string
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({
  type,
  className,
}) => {
  const Icon = providerIconMap[type]
  if (!Icon) return null
  return (
    <div className={`flex-shrink-0 ${className || ""}`}>
      <Icon size={16} />
    </div>
  )
}

export default ProviderIcon
