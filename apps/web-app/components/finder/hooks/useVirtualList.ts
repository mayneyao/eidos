"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export interface VirtualListOptions {
  itemHeight: number
  overscan?: number
}

export interface VirtualListItem<T> {
  data: T
  index: number
  style: React.CSSProperties
}

export interface VirtualListState<T> {
  virtualItems: VirtualListItem<T>[]
  totalHeight: number
  startIndex: number
  endIndex: number
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void
  scrollToTop: () => void
  scrollToBottom: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
  isScrolling: boolean
}

// RAF-based throttling for smooth performance
function useRafThrottle<T extends (...args: any[]) => void>(callback: T): T {
  const rafRef = useRef<number | null>(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  return useCallback(
    ((...args) => {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        callbackRef.current(...args)
      })
    }) as T,
    []
  )
}

// Track scroll momentum
function useScrollMomentum() {
  const [isScrolling, setIsScrolling] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const onScrollStart = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsScrolling(true)
  }, [])

  const onScrollEnd = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      setIsScrolling(false)
    }, 150)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { isScrolling, onScrollStart, onScrollEnd }
}

/**
 * High-performance virtual scroll hook
 * Manually implemented for maximum control and performance
 *
 * Features:
 * - RAF-based throttling for 60fps scroll
 * - Scroll momentum detection for dynamic rendering
 * - Efficient memory usage with overscan
 * - Smooth scroll-to-index with alignment
 */
export function useVirtualList<T>(
  items: T[],
  options: VirtualListOptions
): VirtualListState<T> {
  const { itemHeight, overscan = 5 } = options

  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const { isScrolling, onScrollStart, onScrollEnd } = useScrollMomentum()

  // Calculate total height
  const totalHeight = useMemo(() => {
    return items.length * itemHeight
  }, [items.length, itemHeight])

  // Calculate visible range with memoization
  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    const end = Math.min(items.length, start + visibleCount + overscan * 2)

    return { start, end, visibleCount }
  }, [scrollTop, containerHeight, itemHeight, overscan, items.length])

  // Generate virtual items
  const virtualItems = useMemo(() => {
    const { start, end } = range
    const result: VirtualListItem<T>[] = []

    for (let i = start; i < end; i++) {
      result.push({
        data: items[i],
        index: i,
        style: {
          position: "absolute",
          top: i * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight,
          willChange: isScrolling ? "transform" : undefined,
        },
      })
    }

    return result
  }, [items, range, itemHeight, isScrolling])

  // Throttled scroll handler
  const handleScroll = useRafThrottle(() => {
    const container = containerRef.current
    if (!container) return

    const newScrollTop = container.scrollTop
    setScrollTop(newScrollTop)
    onScrollStart()
    onScrollEnd()
  })

  // Setup scroll listener and resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Initial measurement
    setContainerHeight(container.clientHeight)

    // Resize observer for container height changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(container)

    // Scroll listener with passive flag for performance
    container.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      container.removeEventListener("scroll", handleScroll)
      resizeObserver.disconnect()
    }
  }, [handleScroll])

  // Scroll to specific index with center alignment option
  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const container = containerRef.current
      if (!container) return

      const targetScrollTop = index * itemHeight
      const maxScrollTop = totalHeight - containerHeight
      const clampedScrollTop = Math.max(
        0,
        Math.min(targetScrollTop, maxScrollTop)
      )

      container.scrollTo({
        top: clampedScrollTop,
        behavior,
      })
    },
    [itemHeight, totalHeight, containerHeight]
  )

  // Scroll to top
  const scrollToTop = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: totalHeight, behavior: "smooth" })
  }, [totalHeight])

  return {
    virtualItems,
    totalHeight,
    startIndex: range.start,
    endIndex: range.end,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
    containerRef,
    isScrolling,
  }
}
