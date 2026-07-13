import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

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
  const viewportRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  const [canScrollBackward, setCanScrollBackward] = useState(false)
  const [canScrollForward, setCanScrollForward] = useState(false)

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const maximumScrollLeft = Math.max(
      0,
      viewport.scrollWidth - viewport.clientWidth
    )
    setCanScrollBackward(viewport.scrollLeft > 1)
    setCanScrollForward(viewport.scrollLeft < maximumScrollLeft - 1)
  }, [])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    updateScrollState()
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollState)
    resizeObserver?.observe(viewport)
    window.addEventListener("resize", updateScrollState)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updateScrollState)
    }
  }, [supportedViews.length, updateScrollState])

  useEffect(() => {
    const activeTab = activeTabRef.current
    if (typeof activeTab?.scrollIntoView === "function") {
      activeTab.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
    updateScrollState()
  }, [activeView?.id, updateScrollState])

  const scrollViews = (direction: -1 | 1) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const distance = Math.max(120, Math.round(viewport.clientWidth * 0.7))
    const left = direction * distance
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (typeof viewport.scrollBy === "function") {
      viewport.scrollBy({
        behavior: reducedMotion ? "auto" : "smooth",
        left,
      })
    } else {
      viewport.scrollLeft += left
      updateScrollState()
    }
  }

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
          onClick={() => scrollViews(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <div
        ref={viewportRef}
        role="tablist"
        aria-label="Base views"
        className="flex min-w-0 items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        {supportedViews.map((view) => (
          <button
            ref={view.id === activeView?.id ? activeTabRef : undefined}
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
      {canScrollForward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mb-1 h-7 w-6 shrink-0 text-muted-foreground"
          aria-label="Scroll Base views forward"
          disabled={disabled}
          onClick={() => scrollViews(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <BaseViewSelector {...props} triggerMode="create" />
      <BaseViewSelector {...props} triggerMode="manage" />
    </div>
  )
}
