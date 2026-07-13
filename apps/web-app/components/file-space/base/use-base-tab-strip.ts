import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"

interface BaseTabStripItem {
  id: string
}

export function useBaseTabStrip<T extends BaseTabStripItem>({
  items,
  activeId,
  onSelect,
}: {
  items: T[]
  activeId?: string | null
  onSelect: (id: string) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  const [canScrollBackward, setCanScrollBackward] = useState(false)
  const [canScrollForward, setCanScrollForward] = useState(false)
  const tabStopId = items.some((item) => item.id === activeId)
    ? activeId
    : items[0]?.id

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
  }, [items.length, updateScrollState])

  useEffect(() => {
    if (typeof activeTabRef.current?.scrollIntoView === "function") {
      activeTabRef.current.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      })
    }
    updateScrollState()
  }, [activeId, updateScrollState])

  const scrollTabs = (direction: -1 | 1) => {
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

  const navigateTabs = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    let targetIndex: number | null = null
    if (event.key === "ArrowLeft") targetIndex = currentIndex - 1
    else if (event.key === "ArrowRight") targetIndex = currentIndex + 1
    else if (event.key === "Home") targetIndex = 0
    else if (event.key === "End") targetIndex = items.length - 1
    if (targetIndex === null || items.length === 0) return

    event.preventDefault()
    const wrappedIndex = (targetIndex + items.length) % items.length
    const target = items[wrappedIndex]
    onSelect(target.id)
    viewportRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [wrappedIndex]?.focus()
  }

  return {
    activeTabRef,
    canScrollBackward,
    canScrollForward,
    navigateTabs,
    scrollTabs,
    tabStopId,
    updateScrollState,
    viewportRef,
  }
}
