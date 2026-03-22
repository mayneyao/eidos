import React from "react"

import { cn } from "@/lib/utils"

import type { PropertyEditorProps } from "./types"

/**
 * Base wrapper component for all property editors
 * Provides consistent styling and behavior
 */
export const BaseEditor: React.FC<{
  children: React.ReactNode
  className?: string
  onClick?: () => void
  readonly?: boolean
  isSystemProperty?: boolean
  isEditing?: boolean
}> = ({
  children,
  className,
  onClick,
  readonly = false,
  isSystemProperty = false,
  isEditing = false,
}) => {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center px-2 text-sm",
        !readonly && !isSystemProperty && onClick && "cursor-pointer",
        readonly || isSystemProperty ? "cursor-default" : "",
        isEditing && "bg-muted/30 rounded-xs",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/**
 * Empty value display component
 */
export const EmptyValue: React.FC<{
  onClick?: () => void
  readonly?: boolean
  isSystemProperty?: boolean
}> = ({ onClick, readonly = false, isSystemProperty = false }) => {
  return (
    <BaseEditor
      onClick={onClick}
      readonly={readonly}
      isSystemProperty={isSystemProperty}
    >
      <span className="text-muted-foreground italic">Empty</span>
    </BaseEditor>
  )
}

/**
 * Higher-order component that adds common editor functionality
 */
export function withEditorBase<T extends PropertyEditorProps>(
  WrappedComponent: React.ComponentType<T>
): React.ComponentType<T> {
  return function EditorWithBase(props: T) {
    const { readonly = false, isSystemProperty = false } = props

    const canEdit = !readonly && !isSystemProperty

    return (
      <WrappedComponent
        {...props}
        readonly={readonly}
        isSystemProperty={isSystemProperty}
      />
    )
  }
}
