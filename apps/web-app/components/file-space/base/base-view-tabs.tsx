import type { ComponentProps } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import {
  BaseViewSelector,
  BaseViewTypeIcon,
  baseExtensionContributionId,
  isBaseBuiltInViewType,
} from "./base-view-selector"
import { useBaseTabStrip } from "./use-base-tab-strip"

type BaseViewTabsProps = ComponentProps<typeof BaseViewSelector>

export function BaseViewTabs(props: BaseViewTabsProps) {
  const { views, activeView, disabled, onSelect } = props
  const supportedViews = views.filter(
    (view) =>
      isBaseBuiltInViewType(view.type) || baseExtensionContributionId(view.type)
  )
  const {
    activeTabRef,
    canScrollBackward,
    canScrollForward,
    navigateTabs,
    scrollTabs,
    tabStopId,
    updateScrollState,
    viewportRef,
  } = useBaseTabStrip({
    items: supportedViews,
    activeId: activeView?.id,
    onSelect,
  })

  return (
    <div className="flex min-w-0 flex-1 items-end">
      {canScrollBackward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mb-1 h-7 w-6 shrink-0 text-muted-foreground"
          aria-label="Scroll Base views backward"
          disabled={disabled}
          onClick={() => scrollTabs(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <div
        ref={viewportRef}
        role="tablist"
        aria-label="Base views"
        aria-orientation="horizontal"
        className="flex min-w-0 items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        {supportedViews.map((view, index) => (
          <button
            ref={view.id === activeView?.id ? activeTabRef : undefined}
            key={view.id}
            type="button"
            role="tab"
            data-base-view-id={view.id}
            aria-selected={view.id === activeView?.id}
            tabIndex={view.id === tabStopId ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelect(view.id)}
            onKeyDown={(event) => navigateTabs(event, index)}
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
      {canScrollForward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mb-1 h-7 w-6 shrink-0 text-muted-foreground"
          aria-label="Scroll Base views forward"
          disabled={disabled}
          onClick={() => scrollTabs(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <BaseViewSelector
        {...props}
        viewAction={undefined}
        triggerMode="create"
      />
      <BaseViewSelector {...props} triggerMode="manage" />
    </div>
  )
}
