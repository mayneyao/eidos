import { useCallback, useRef, type TouchEvent, type UIEvent } from "react"

// CSS pixels: tolerate a little finger jitter without treating a drag as a tap.
const TAP_SLOP = 8

export function useEidosFileGridTouch() {
  const gesture = useRef<{
    id: number
    x: number
    y: number
    active: boolean
    moved: boolean
  } | null>(null)
  const inside = (event: UIEvent<HTMLDivElement>) =>
    event.currentTarget.contains(event.target as Node)
  const track = (touches: TouchEvent<HTMLDivElement>["touches"]) => {
    const current = gesture.current
    if (!current?.active) return
    const touch = Array.from(touches).find(
      (item) => item.identifier === current.id
    )
    if (
      touch &&
      Math.hypot(touch.clientX - current.x, touch.clientY - current.y) >
        TAP_SLOP
    )
      current.moved = true
  }
  const suppressTouch = useCallback(
    (isTouch: boolean) => isTouch && gesture.current?.moved === true,
    []
  )
  return {
    suppressTouch,
    consumeTouch: useCallback(() => {
      if (gesture.current) gesture.current.moved = true
    }, []),
    capture: {
      onTouchStartCapture(event: TouchEvent<HTMLDivElement>) {
        if (!inside(event)) return
        if (gesture.current?.active) {
          gesture.current.moved = true
          return
        }
        const touch = event.touches[0]
        if (!touch) return
        gesture.current = {
          id: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
          active: true,
          moved: event.touches.length !== 1,
        }
      },
      onTouchMoveCapture(event: TouchEvent<HTMLDivElement>) {
        if (inside(event)) track(event.touches)
      },
      onTouchEndCapture(event: TouchEvent<HTMLDivElement>) {
        if (!inside(event)) return
        track(event.changedTouches)
        if (gesture.current) gesture.current.active = event.touches.length > 0
        // Retain the decision until the next touchstart: Glide handles touchend
        // on window, after these capture handlers, and may still emit a click.
      },
      onTouchCancelCapture(event: TouchEvent<HTMLDivElement>) {
        if (!inside(event) || !gesture.current) return
        gesture.current.moved = true
        gesture.current.active = false
      },
      onScrollCapture(event: UIEvent<HTMLDivElement>) {
        if (inside(event) && gesture.current?.active)
          gesture.current.moved = true
      },
    },
  }
}
