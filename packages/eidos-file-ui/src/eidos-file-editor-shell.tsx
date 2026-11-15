import { forwardRef, type HTMLAttributes, type ReactNode } from "react"
import type { EidosFileViewInfo } from "@eidos.space/eidos-file"
import { EidosFileCalendarViewProvider } from "./eidos-file-calendar-context"
import { useEidosFileUI } from "./context"

import {
  EidosFileEditorContent,
  EidosFileEditorRoot,
  EidosFileEditorWorkbar,
} from "./eidos-file-editor-chrome"
import { EidosFileSearchNavigationProvider } from "./eidos-file-search-navigation"
import { cn } from "./lib/cn"

export interface EidosFileEditorShellProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  view?: EidosFileViewInfo
  calendarPeriodTimeZoneData?: readonly string[]
  calendarWindowVersion?: 1
  viewTabs?: ReactNode
  queryToolbar?: ReactNode
  fields?: ReactNode
  fieldCreator?: ReactNode
  banner?: ReactNode
  children: ReactNode
  contentProps?: HTMLAttributes<HTMLDivElement>
  sheetTabs?: ReactNode
  overlays?: ReactNode
  searchNavigation?: { search: string; scopeKey: string }
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
    view,
    calendarPeriodTimeZoneData,
    calendarWindowVersion,
    viewTabs,
    queryToolbar,
    fields,
    fieldCreator,
    banner,
    children,
    contentProps,
    sheetTabs,
    overlays,
    searchNavigation,
    className,
    ...props
  },
  ref
) {
  const hasFieldActions = fields !== undefined || fieldCreator !== undefined
  const { translate: t } = useEidosFileUI()
  const editor = (
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
  const content = searchNavigation ? (
    <EidosFileSearchNavigationProvider {...searchNavigation}>
      {editor}
    </EidosFileSearchNavigationProvider>
  ) : (
    editor
  )
  return (
    <EidosFileCalendarViewProvider
      view={view}
      supported={calendarPeriodTimeZoneData ?? []}
      calendarWindowVersion={calendarWindowVersion}
      unsupported={
        <EidosFileEditorRoot className={className}>
          <EidosFileEditorWorkbar>
            {viewTabs}
            {queryToolbar}
          </EidosFileEditorWorkbar>
          <div role="status" className="p-4 text-sm">
            {t(
              "This editor cannot use the application's calendar settings. Open this view in an updated editor."
            )}
          </div>
        </EidosFileEditorRoot>
      }
    >
      {content}
    </EidosFileCalendarViewProvider>
  )
})

EidosFileEditorShell.displayName = "EidosFileEditorShell"
