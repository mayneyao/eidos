import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

import {
  BaseViewSelector,
  BaseViewTypeIcon,
  isBaseBuiltInViewType,
} from "./base-view-selector"

type BaseViewTabsProps = ComponentProps<typeof BaseViewSelector>

export function BaseViewTabs(props: BaseViewTabsProps) {
  const { views, activeView, disabled, onSelect } = props
  const supportedViews = views.filter((view) =>
    isBaseBuiltInViewType(view.type)
  )

  return (
    <div className="flex min-w-0 flex-1 items-end">
      <div
        role="tablist"
        aria-label="Base views"
        className="flex min-w-0 items-end overflow-x-auto"
      >
        {supportedViews.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={view.id === activeView?.id}
            disabled={disabled}
            onClick={() => onSelect(view.id)}
            className={cn(
              "relative flex h-9 max-w-48 shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50",
              view.id === activeView?.id && "text-foreground"
            )}
          >
            <BaseViewTypeIcon
              type={view.type}
              className="h-3.5 w-3.5 shrink-0"
            />
            <span className="truncate">{view.name}</span>
            {view.id === activeView?.id ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 bg-foreground/75" />
            ) : null}
          </button>
        ))}
      </div>
      <BaseViewSelector {...props} triggerMode="create" />
      <BaseViewSelector {...props} triggerMode="manage" />
    </div>
  )
}
