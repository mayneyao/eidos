import { useCallback, useLayoutEffect, useRef } from "react"
import {
  observeElementOffset,
  useVirtualizer,
  type Rect,
  type ScrollToOptions,
  type VirtualItem,
  type Virtualizer,
} from "@tanstack/react-virtual"

// Chromium currently clamps layout dimensions at roughly 2^24 CSS pixels.
// Keep enough headroom for borders, padding, and platform rounding.
export const BASE_VIRTUAL_SCROLL_MAX_SIZE = 12_000_000
// TanStack precomputes one measurement per item in the active window. Two
// thousand items still preserve hundreds of viewports of measured card heights
// while halving the cache allocated by each visible million-record Kanban
// column. Moving the window by one quarter retains 75% of those measurements.
export const BASE_VIRTUAL_SCROLL_MAX_ITEMS = 2_048
const BASE_VIRTUAL_SCROLL_CHUNK_ITEMS = 512
const BASE_VIRTUAL_INDEX_ATTRIBUTE = "data-base-virtual-index"

export interface BaseVirtualWindow {
  start: number
  count: number
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function mapScrollRange(
  offset: number,
  sourceSize: number,
  targetSize: number,
  viewportSize: number
): number {
  const safeViewportSize = finiteNonNegative(viewportSize)
  const sourceMaximum = Math.max(
    0,
    finiteNonNegative(sourceSize) - safeViewportSize
  )
  const targetMaximum = Math.max(
    0,
    finiteNonNegative(targetSize) - safeViewportSize
  )
  if (sourceMaximum === 0 || targetMaximum === 0) return 0
  return (
    (clamp(finiteNonNegative(offset), 0, sourceMaximum) / sourceMaximum) *
    targetMaximum
  )
}

function estimatedWindowSize(
  itemCount: number,
  estimatedStride: number,
  gap: number
): number {
  return itemCount > 0 ? itemCount * estimatedStride - Math.max(0, gap) : 0
}

export function baseVirtualPhysicalSize(logicalSize: number): number {
  return Math.min(finiteNonNegative(logicalSize), BASE_VIRTUAL_SCROLL_MAX_SIZE)
}

export function baseVirtualWindowForOffset(
  totalCount: number,
  estimatedStride: number,
  logicalOffset: number
): BaseVirtualWindow {
  const safeCount = Math.max(0, Math.floor(totalCount))
  if (safeCount <= BASE_VIRTUAL_SCROLL_MAX_ITEMS) {
    return { start: 0, count: safeCount }
  }
  const safeStride = Math.max(1, finiteNonNegative(estimatedStride))
  const anchorIndex = clamp(
    Math.floor(finiteNonNegative(logicalOffset) / safeStride),
    0,
    safeCount - 1
  )
  const chunkStart =
    Math.floor(anchorIndex / BASE_VIRTUAL_SCROLL_CHUNK_ITEMS) *
    BASE_VIRTUAL_SCROLL_CHUNK_ITEMS
  const start = clamp(
    chunkStart - BASE_VIRTUAL_SCROLL_CHUNK_ITEMS,
    0,
    safeCount - BASE_VIRTUAL_SCROLL_MAX_ITEMS
  )
  return { start, count: BASE_VIRTUAL_SCROLL_MAX_ITEMS }
}

export function baseVirtualLogicalOffset(
  physicalOffset: number,
  logicalSize: number,
  viewportSize: number
): number {
  const safeLogicalSize = finiteNonNegative(logicalSize)
  const safeViewportSize = finiteNonNegative(viewportSize)
  const logicalMaximum = Math.max(0, safeLogicalSize - safeViewportSize)
  const physicalMaximum = Math.max(
    0,
    baseVirtualPhysicalSize(safeLogicalSize) - safeViewportSize
  )
  if (logicalMaximum === 0 || physicalMaximum === 0) return 0
  const safePhysicalOffset = clamp(
    finiteNonNegative(physicalOffset),
    0,
    physicalMaximum
  )
  return (safePhysicalOffset / physicalMaximum) * logicalMaximum
}

export function baseVirtualPhysicalOffset(
  logicalOffset: number,
  logicalSize: number,
  viewportSize: number
): number {
  const safeLogicalSize = finiteNonNegative(logicalSize)
  const safeViewportSize = finiteNonNegative(viewportSize)
  const logicalMaximum = Math.max(0, safeLogicalSize - safeViewportSize)
  const physicalMaximum = Math.max(
    0,
    baseVirtualPhysicalSize(safeLogicalSize) - safeViewportSize
  )
  if (logicalMaximum === 0 || physicalMaximum === 0) return 0
  const safeLogicalOffset = clamp(
    finiteNonNegative(logicalOffset),
    0,
    logicalMaximum
  )
  return (safeLogicalOffset / logicalMaximum) * physicalMaximum
}

export function baseVirtualItemOffset(
  logicalItemOffset: number,
  physicalScrollOffset: number,
  logicalSize: number,
  viewportSize: number
): number {
  const logicalScrollOffset = baseVirtualLogicalOffset(
    physicalScrollOffset,
    logicalSize,
    viewportSize
  )
  return physicalScrollOffset + logicalItemOffset - logicalScrollOffset
}

interface BaseBoundedVirtualizerOptions<
  TScrollElement extends HTMLElement,
  TItemElement extends Element,
> {
  count: number
  getScrollElement: () => TScrollElement | null
  estimatedItemSize: number
  getItemKey: (globalIndex: number) => number | string | bigint
  gap?: number
  initialRect: Rect
  overscan?: number
  useAnimationFrameWithResizeObserver?: boolean
}

interface BaseBoundedVirtualizerGeometry {
  bounded: boolean
  totalCount: number
  estimatedStride: number
  estimatedItemSize: number
  estimatedWindowSize: number
  localSize: number
  logicalSize: number
  windowStart: number
  windowCount: number
}

export interface BaseBoundedVirtualizerResult<
  TScrollElement extends HTMLElement,
  TItemElement extends Element,
> {
  virtualizer: Virtualizer<TScrollElement, TItemElement>
  virtualItems: VirtualItem[]
  logicalSize: number
  physicalSize: number
  physicalScrollOffset: number
  logicalScrollOffset: number
  localScrollOffset: number
  viewportSize: number
  measurementCount: number
  globalIndex: (localIndex: number) => number
  itemOffset: (item: VirtualItem) => number
  scrollToIndex: (globalIndex: number, options?: ScrollToOptions) => void
}

export function resetBaseVirtualizerMeasurements<
  TScrollElement extends HTMLElement,
  TItemElement extends Element,
>(virtualizer: Virtualizer<TScrollElement, TItemElement>): void {
  const measuredElements = virtualizer.scrollElement?.querySelectorAll(
    `[${BASE_VIRTUAL_INDEX_ATTRIBUTE}]`
  )
  virtualizer.measure()
  measuredElements?.forEach((element) => {
    virtualizer.measureElement(element as TItemElement)
  })
}

export function useBaseBoundedVirtualizer<
  TScrollElement extends HTMLElement,
  TItemElement extends Element,
>({
  count,
  getScrollElement,
  estimatedItemSize,
  getItemKey,
  gap = 0,
  initialRect,
  overscan,
  useAnimationFrameWithResizeObserver,
}: BaseBoundedVirtualizerOptions<
  TScrollElement,
  TItemElement
>): BaseBoundedVirtualizerResult<TScrollElement, TItemElement> {
  const safeItemSize = Math.max(1, finiteNonNegative(estimatedItemSize))
  const estimatedStride = safeItemSize + Math.max(0, gap)
  const estimatedLogicalSize = estimatedWindowSize(count, estimatedStride, gap)
  const element = getScrollElement()
  const viewportSize = element?.clientHeight || initialRect.height
  const physicalScrollOffset = element?.scrollTop ?? 0
  const estimatedLogicalOffset = baseVirtualLogicalOffset(
    physicalScrollOffset,
    estimatedLogicalSize,
    viewportSize
  )
  const virtualWindow = baseVirtualWindowForOffset(
    count,
    estimatedStride,
    estimatedLogicalOffset
  )
  const initialEstimatedWindowSize = estimatedWindowSize(
    virtualWindow.count,
    estimatedStride,
    gap
  )
  const geometryRef = useRef<BaseBoundedVirtualizerGeometry>({
    bounded: count > BASE_VIRTUAL_SCROLL_MAX_ITEMS,
    totalCount: count,
    estimatedStride,
    estimatedItemSize: safeItemSize,
    estimatedWindowSize: initialEstimatedWindowSize,
    localSize: initialEstimatedWindowSize,
    logicalSize: estimatedLogicalSize,
    windowStart: virtualWindow.start,
    windowCount: virtualWindow.count,
  })

  const observeOffset = useCallback(
    (
      instance: Virtualizer<TScrollElement, TItemElement>,
      callback: (offset: number, isScrolling: boolean) => void
    ) =>
      observeElementOffset(instance, (physicalOffset, isScrolling) => {
        const geometry = geometryRef.current
        const nextViewportSize =
          instance.scrollElement?.clientHeight ||
          instance.scrollRect?.height ||
          initialRect.height
        const globalLogicalOffset = baseVirtualLogicalOffset(
          physicalOffset,
          geometry.logicalSize,
          nextViewportSize
        )
        const nextWindow = baseVirtualWindowForOffset(
          geometry.totalCount,
          geometry.estimatedStride,
          globalLogicalOffset
        )
        const estimatedLocalOffset =
          globalLogicalOffset - nextWindow.start * geometry.estimatedStride
        const nextEstimatedWindowSize = estimatedWindowSize(
          nextWindow.count,
          geometry.estimatedStride,
          gap
        )
        const nextLocalSize =
          geometry.bounded && nextWindow.start === geometry.windowStart
            ? instance.getTotalSize()
            : nextEstimatedWindowSize
        callback(
          geometry.bounded
            ? mapScrollRange(
                estimatedLocalOffset,
                nextEstimatedWindowSize,
                nextLocalSize,
                nextViewportSize
              )
            : globalLogicalOffset,
          isScrolling
        )
      }),
    [gap, initialRect.height]
  )

  const scrollToOffset = useCallback(
    (
      localLogicalOffset: number,
      options: { adjustments?: number; behavior?: ScrollBehavior },
      instance: Virtualizer<TScrollElement, TItemElement>
    ) => {
      const geometry = geometryRef.current
      const scrollElement = instance.scrollElement
      if (!scrollElement) return
      const nextViewportSize =
        scrollElement.clientHeight ||
        instance.scrollRect?.height ||
        initialRect.height
      const adjustedLocalOffset =
        localLogicalOffset + (options.adjustments ?? 0)
      const estimatedLocalOffset = geometry.bounded
        ? mapScrollRange(
            adjustedLocalOffset,
            geometry.localSize,
            geometry.estimatedWindowSize,
            nextViewportSize
          )
        : adjustedLocalOffset
      const globalLogicalOffset = geometry.bounded
        ? geometry.windowStart * geometry.estimatedStride + estimatedLocalOffset
        : estimatedLocalOffset
      scrollElement.scrollTo({
        top: baseVirtualPhysicalOffset(
          globalLogicalOffset,
          geometry.logicalSize,
          nextViewportSize
        ),
        behavior: options.behavior,
      })
    },
    [initialRect.height]
  )

  const localItemKey = useCallback(
    (localIndex: number) => getItemKey(virtualWindow.start + localIndex),
    [getItemKey, virtualWindow.start]
  )
  const virtualizer = useVirtualizer<TScrollElement, TItemElement>({
    count: virtualWindow.count,
    getScrollElement,
    estimateSize: () => safeItemSize,
    getItemKey: localItemKey,
    gap,
    initialRect,
    overscan,
    useAnimationFrameWithResizeObserver,
    indexAttribute: BASE_VIRTUAL_INDEX_ATTRIBUTE,
    observeElementOffset: observeOffset,
    scrollToFn: scrollToOffset,
  })
  const measuredWindowStartRef = useRef(virtualWindow.start)
  useLayoutEffect(() => {
    if (measuredWindowStartRef.current === virtualWindow.start) return
    measuredWindowStartRef.current = virtualWindow.start
    resetBaseVirtualizerMeasurements(virtualizer)
  }, [virtualWindow.start, virtualizer])
  const virtualItems = virtualizer.getVirtualItems()
  const localLogicalSize = virtualizer.getTotalSize()
  const logicalSize =
    count <= BASE_VIRTUAL_SCROLL_MAX_ITEMS
      ? localLogicalSize
      : estimatedLogicalSize
  const logicalScrollOffset = baseVirtualLogicalOffset(
    physicalScrollOffset,
    logicalSize,
    viewportSize
  )
  const bounded = count > BASE_VIRTUAL_SCROLL_MAX_ITEMS
  const currentEstimatedWindowSize = estimatedWindowSize(
    virtualWindow.count,
    estimatedStride,
    gap
  )
  const estimatedLocalScrollOffset =
    logicalScrollOffset - virtualWindow.start * estimatedStride
  const localScrollOffset = bounded
    ? mapScrollRange(
        estimatedLocalScrollOffset,
        currentEstimatedWindowSize,
        localLogicalSize,
        viewportSize
      )
    : logicalScrollOffset
  geometryRef.current = {
    bounded,
    totalCount: count,
    estimatedStride,
    estimatedItemSize: safeItemSize,
    estimatedWindowSize: currentEstimatedWindowSize,
    localSize: localLogicalSize,
    logicalSize,
    windowStart: virtualWindow.start,
    windowCount: virtualWindow.count,
  }

  const globalIndex = useCallback(
    (localIndex: number) => virtualWindow.start + localIndex,
    [virtualWindow.start]
  )
  const itemOffset = useCallback(
    (item: VirtualItem) =>
      physicalScrollOffset + item.start - localScrollOffset,
    [localScrollOffset, physicalScrollOffset]
  )
  const scrollToIndex = useCallback(
    (targetIndex: number, options: ScrollToOptions = {}) => {
      const geometry = geometryRef.current
      if (geometry.totalCount === 0) return
      const safeTargetIndex = clamp(
        Math.floor(targetIndex),
        0,
        geometry.totalCount - 1
      )
      const localIndex = safeTargetIndex - geometry.windowStart
      if (localIndex >= 0 && localIndex < geometry.windowCount) {
        virtualizer.scrollToIndex(localIndex, options)
        return
      }
      const scrollElement = virtualizer.scrollElement
      if (!scrollElement) return
      const nextViewportSize =
        scrollElement.clientHeight ||
        virtualizer.scrollRect?.height ||
        initialRect.height
      const itemStart = safeTargetIndex * geometry.estimatedStride
      const currentLogicalOffset = baseVirtualLogicalOffset(
        scrollElement.scrollTop,
        geometry.logicalSize,
        nextViewportSize
      )
      const align = options.align ?? "auto"
      let targetLogicalOffset = itemStart
      if (align === "center") {
        targetLogicalOffset =
          itemStart - (nextViewportSize - geometry.estimatedItemSize) / 2
      } else if (align === "end") {
        targetLogicalOffset =
          itemStart - nextViewportSize + geometry.estimatedItemSize
      } else if (align === "auto") {
        const itemEnd = itemStart + geometry.estimatedItemSize
        if (
          itemStart >= currentLogicalOffset &&
          itemEnd <= currentLogicalOffset + nextViewportSize
        ) {
          return
        }
        targetLogicalOffset =
          itemStart < currentLogicalOffset
            ? itemStart
            : itemEnd - nextViewportSize
      }
      scrollElement.scrollTo({
        top: baseVirtualPhysicalOffset(
          targetLogicalOffset,
          geometry.logicalSize,
          nextViewportSize
        ),
        behavior: options.behavior,
      })
    },
    [initialRect.height, virtualizer]
  )

  return {
    virtualizer,
    virtualItems,
    logicalSize,
    physicalSize: baseVirtualPhysicalSize(logicalSize),
    physicalScrollOffset,
    logicalScrollOffset,
    localScrollOffset,
    viewportSize,
    measurementCount: virtualWindow.count,
    globalIndex,
    itemOffset,
    scrollToIndex,
  }
}
