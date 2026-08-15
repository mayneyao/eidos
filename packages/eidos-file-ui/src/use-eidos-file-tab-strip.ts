import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"

export interface EidosFileTabStripItem {
  id: string
}

/**
 * Matches a `keydown` event against an aria-keyshortcuts style binding like
 * "Control+PageUp". The modifier set must match exactly so composed bindings
 * (e.g. Control+Shift+PageUp) never shadow their simpler variants.
 */
export function eidosFileKeyboardEventMatchesBinding(
  event: {
    key: string
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
    shiftKey: boolean
  },
  binding: string
): boolean {
  const parts = binding.split("+")
  const key = parts[parts.length - 1]
  const modifiers = new Set(parts.slice(0, -1))
  if (event.key !== key) return false
  return (
    event.ctrlKey === modifiers.has("Control") &&
    event.metaKey === modifiers.has("Meta") &&
    event.altKey === modifiers.has("Alt") &&
    event.shiftKey === modifiers.has("Shift")
  )
}

/**
 * Global previous/next tab cycling for a tab strip, so keyboard users can
 * switch tabs without first focusing the strip (the declared
 * aria-keyshortcuts contract). Typing contexts (inputs, text areas, rich
 * text) keep the keys for their own editing behavior.
 */
export function useEidosFileTabCycleShortcut<T extends EidosFileTabStripItem>({
  items,
  activeId,
  disabled = false,
  onSelect,
  previousBindings,
  nextBindings,
}: {
  items: readonly T[]
  activeId?: string | null
  disabled?: boolean
  onSelect: (id: string) => void
  previousBindings: readonly string[]
  nextBindings: readonly string[]
}) {
  const itemsRef = useRef(items)
  const activeIdRef = useRef(activeId)
  const onSelectRef = useRef(onSelect)
  itemsRef.current = items
  activeIdRef.current = activeId
  onSelectRef.current = onSelect

  useEffect(() => {
    if (disabled) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return
      const currentItems = itemsRef.current
      if (currentItems.length < 2) return
      const direction = previousBindings.some((binding) =>
        eidosFileKeyboardEventMatchesBinding(event, binding)
      )
        ? -1
        : nextBindings.some((binding) =>
              eidosFileKeyboardEventMatchesBinding(event, binding)
            )
          ? 1
          : null
      if (direction === null) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }
      event.preventDefault()
      const currentIndex = currentItems.findIndex(
        (item) => item.id === activeIdRef.current
      )
      const nextIndex =
        ((currentIndex < 0 ? 0 : currentIndex) +
          direction +
          currentItems.length) %
        currentItems.length
      onSelectRef.current(currentItems[nextIndex].id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [disabled, nextBindings, previousBindings])
}

export function useEidosFileTabStrip<T extends EidosFileTabStripItem>({
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
