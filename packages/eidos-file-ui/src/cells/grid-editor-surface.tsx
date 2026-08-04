import * as React from "react"
import type {
  CustomCell,
  ProvideEditorComponent,
} from "@glideapps/glide-data-grid"

import { cn } from "../lib/cn"
import { PopoverContent } from "../ui/primitives"

export const EIDOS_FILE_GRID_EDITOR_PORTAL_CLASS_NAME =
  "click-outside-ignore z-[10000] w-auto border-0 bg-transparent p-0 shadow-none"

export const EIDOS_FILE_GRID_EDITOR_COLLISION_PADDING = 12

export const EIDOS_FILE_GRID_EDITOR_ALIGN_OFFSET = 0

export const EIDOS_FILE_GRID_EDITOR_SIDE_OFFSET = 0

export const EIDOS_FILE_GRID_EDITOR_CELL_EDGE_COMPENSATION = 1

export const EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME =
  "flex h-8 shrink-0 items-center border-t bg-muted/30 px-2.5 text-[10px] text-muted-foreground"

export const EIDOS_FILE_GRID_EDITOR_CONTROL_CLASS_NAME = "shrink-0 border-b p-2"

export const EIDOS_FILE_GRID_EDITOR_BODY_CLASS_NAME =
  "min-h-0 flex-1 overflow-y-auto p-1.5"

export function EidosFileGridEditorSurface({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-eidos-file-grid-editor-surface=""
      className={cn(
        "click-outside-ignore flex w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-md border border-border/70 bg-popover text-popover-foreground shadow-xs",
        className
      )}
      {...props}
    />
  )
}

export function EidosFileGridEditorHeader({
  icon,
  title,
}: {
  icon: React.ReactNode
  title: React.ReactNode
}) {
  return (
    <div
      data-eidos-file-grid-editor-header=""
      className="flex h-10 shrink-0 items-center gap-2 border-b px-2.5"
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {title}
      </span>
    </div>
  )
}

export type EidosFileGridEditorPopoverContentProps =
  React.ComponentPropsWithoutRef<typeof PopoverContent>

export const EidosFileGridEditorPopoverContent: React.ForwardRefExoticComponent<
  EidosFileGridEditorPopoverContentProps & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<HTMLDivElement, EidosFileGridEditorPopoverContentProps>(
  (
    {
      align = "start",
      alignOffset = EIDOS_FILE_GRID_EDITOR_ALIGN_OFFSET,
      className,
      collisionPadding = EIDOS_FILE_GRID_EDITOR_COLLISION_PADDING,
      sideOffset = EIDOS_FILE_GRID_EDITOR_SIDE_OFFSET,
      ...props
    },
    ref
  ) => (
    <PopoverContent
      ref={ref}
      align={align}
      alignOffset={alignOffset}
      className={cn(EIDOS_FILE_GRID_EDITOR_PORTAL_CLASS_NAME, className)}
      collisionPadding={collisionPadding}
      data-eidos-file-grid-editor-popover=""
      sideOffset={sideOffset}
      {...props}
    />
  )
)
EidosFileGridEditorPopoverContent.displayName =
  "EidosFileGridEditorPopoverContent"

export function eidosFileGridPopupEditor<T extends CustomCell>(
  editor: ProvideEditorComponent<T>
) {
  return {
    editor,
    disablePadding: true,
    disableStyling: true,
    styleOverride: {
      marginLeft: EIDOS_FILE_GRID_EDITOR_CELL_EDGE_COMPENSATION,
      marginTop: EIDOS_FILE_GRID_EDITOR_CELL_EDGE_COMPENSATION,
    },
  } as const
}
