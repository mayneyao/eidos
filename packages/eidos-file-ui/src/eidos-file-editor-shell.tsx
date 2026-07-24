import { forwardRef, type HTMLAttributes, type ReactNode } from "react"

import {
  EidosFileEditorContent,
  EidosFileEditorRoot,
  EidosFileEditorWorkbar,
} from "./eidos-file-editor-chrome"
import { cn } from "./lib/cn"

export interface EidosFileEditorShellProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  viewTabs?: ReactNode
  queryToolbar?: ReactNode
  fields?: ReactNode
  fieldCreator?: ReactNode
  banner?: ReactNode
  children: ReactNode
  contentProps?: HTMLAttributes<HTMLDivElement>
  sheetTabs?: ReactNode
  overlays?: ReactNode
}

/**
 * Canonical Eidos File editor composition shared by every host.
 *
 * Hosts own file/session lifecycle and provide the rendered view, while this
 * component owns the stable UI hierarchy and interaction placement.
 */
export const EidosFileEditorShell = forwardRef<
  HTMLDivElement,
  EidosFileEditorShellProps
>(function EidosFileEditorShell(
  {
    viewTabs,
    queryToolbar,
    fields,
    fieldCreator,
    banner,
    children,
    contentProps,
    sheetTabs,
    overlays,
    className,
    ...props
  },
  ref
) {
  const hasFieldActions = fields !== undefined || fieldCreator !== undefined
  return (
    <EidosFileEditorRoot
      ref={ref}
      className={className}
      data-eidos-file-editor-shell
      {...props}
    >
      <EidosFileEditorWorkbar>
        {viewTabs ?? <div className="min-w-0 flex-1" />}
        <div
          data-eidos-file-workbar-actions
          className="eidos-file-workbar-actions flex h-9 min-w-0 shrink-0 items-center gap-1 pl-2"
        >
          {queryToolbar}
          {hasFieldActions ? (
            <div
              className="add-property-wrap relative"
              data-eidos-file-field-actions
            >
              {fields}
              {fieldCreator}
            </div>
          ) : null}
        </div>
      </EidosFileEditorWorkbar>
      {banner}
      <EidosFileEditorContent
        {...contentProps}
        className={cn(contentProps?.className)}
      >
        {children}
      </EidosFileEditorContent>
      {sheetTabs}
      {overlays}
    </EidosFileEditorRoot>
  )
})

EidosFileEditorShell.displayName = "EidosFileEditorShell"
