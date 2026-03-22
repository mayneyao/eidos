"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Copy, Check } from "lucide-react"

import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

interface TooltipState {
  content: string
  x: number
  y: number
  visible: boolean
  position: "top" | "bottom" | "left" | "right"
}

export function GodModeTooltip() {
  const { isGodMode } = useAppRuntimeStore()
  const [tooltip, setTooltip] = useState<TooltipState>({
    content: "",
    x: 0,
    y: 0,
    visible: false,
    position: "top",
  })
  const [isHovering, setIsHovering] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [hoverTimeoutId, setHoverTimeoutId] = useState<NodeJS.Timeout | null>(
    null
  )

  const calculateOptimalPosition = (
    targetRect: DOMRect,
    content: string
  ): {
    x: number
    y: number
    position: "top" | "bottom" | "left" | "right"
  } => {
    // 估算 tooltip 尺寸（基于内容长度和样式）
    const estimatedWidth = Math.min(Math.max(content.length * 8, 120), 320) // 最小120px，最大320px
    const estimatedHeight = 60 // 增加高度以容纳复制按钮

    // 获取视口尺寸
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // 计算各个方向的可用空间
    const spaceTop = targetRect.top
    const spaceBottom = viewportHeight - targetRect.bottom
    const spaceLeft = targetRect.left
    const spaceRight = viewportWidth - targetRect.right

    // 优先级：上 > 下 > 右 > 左
    let position: "top" | "bottom" | "left" | "right" = "top"
    let x: number
    let y: number

    // 检查上方空间
    if (spaceTop >= estimatedHeight + 16) {
      position = "top"
      x = Math.max(
        8,
        Math.min(
          targetRect.left + targetRect.width / 2,
          viewportWidth - estimatedWidth - 8
        )
      )
      y = targetRect.top - 8
    }
    // 检查下方空间
    else if (spaceBottom >= estimatedHeight + 16) {
      position = "bottom"
      x = Math.max(
        8,
        Math.min(
          targetRect.left + targetRect.width / 2,
          viewportWidth - estimatedWidth - 8
        )
      )
      y = targetRect.bottom + 8
    }
    // 检查右方空间
    else if (spaceRight >= estimatedWidth + 16) {
      position = "right"
      x = targetRect.right + 8
      y = Math.max(
        8,
        Math.min(
          targetRect.top + targetRect.height / 2,
          viewportHeight - estimatedHeight - 8
        )
      )
    }
    // 检查左方空间
    else if (spaceLeft >= estimatedWidth + 16) {
      position = "left"
      x = targetRect.left - 8
      y = Math.max(
        8,
        Math.min(
          targetRect.top + targetRect.height / 2,
          viewportHeight - estimatedHeight - 8
        )
      )
    }
    // 如果都不够，选择空间最大的方向
    else {
      const maxSpace = Math.max(spaceTop, spaceBottom, spaceLeft, spaceRight)
      if (maxSpace === spaceTop) {
        position = "top"
        x = Math.max(
          8,
          Math.min(
            targetRect.left + targetRect.width / 2,
            viewportWidth - estimatedWidth - 8
          )
        )
        y = Math.max(8, targetRect.top - 8)
      } else if (maxSpace === spaceBottom) {
        position = "bottom"
        x = Math.max(
          8,
          Math.min(
            targetRect.left + targetRect.width / 2,
            viewportWidth - estimatedWidth - 8
          )
        )
        y = Math.min(
          viewportHeight - estimatedHeight - 8,
          targetRect.bottom + 8
        )
      } else if (maxSpace === spaceRight) {
        position = "right"
        x = Math.min(viewportWidth - estimatedWidth - 8, targetRect.right + 8)
        y = Math.max(
          8,
          Math.min(
            targetRect.top + targetRect.height / 2,
            viewportHeight - estimatedHeight - 8
          )
        )
      } else {
        position = "left"
        x = Math.max(8, targetRect.left - 8)
        y = Math.max(
          8,
          Math.min(
            targetRect.top + targetRect.height / 2,
            viewportHeight - estimatedHeight - 8
          )
        )
      }
    }

    return { x, y, position }
  }

  const hideTooltip = () => {
    setTooltip((prev) => ({ ...prev, visible: false }))
    setIsHovering(false)
    setIsCopied(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tooltip.content)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  useEffect(() => {
    if (!isGodMode) {
      hideTooltip()
      return
    }

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target) return

      // 检查是否是 tooltip 元素或其子元素
      const isTooltipElement = target.closest("[data-tooltip-container]")
      if (isTooltipElement) {
        // 如果鼠标移动到 tooltip 上，清除隐藏定时器
        if (hoverTimeoutId) {
          clearTimeout(hoverTimeoutId)
          setHoverTimeoutId(null)
        }
        return
      }

      const eidosData = target.getAttribute("data-eidos")
      console.log("eidosData", eidosData)
      if (!eidosData) {
        // 如果不是悬停在有 data-eidos 的元素上，只有在当前没有显示 tooltip 或者用户不在 tooltip 上时才延迟隐藏
        if (!tooltip.visible || isHovering) {
          return
        }
        if (hoverTimeoutId) {
          clearTimeout(hoverTimeoutId)
        }
        const timeoutId = setTimeout(() => {
          if (!isHovering) {
            hideTooltip()
          }
        }, 200)
        setHoverTimeoutId(timeoutId)
        return
      }

      // 清除任何现有的隐藏超时
      if (hoverTimeoutId) {
        clearTimeout(hoverTimeoutId)
        setHoverTimeoutId(null)
      }

      const rect = target.getBoundingClientRect()
      const { x, y, position } = calculateOptimalPosition(rect, eidosData)

      setTooltip({
        content: eidosData,
        x,
        y,
        position,
        visible: true,
      })
    }

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target) return

      // 检查是否是从 tooltip 移出
      const isFromTooltip = target.closest("[data-tooltip-container]")
      if (isFromTooltip) {
        return // tooltip 的 onMouseLeave 会处理隐藏逻辑
      }

      const eidosData = target.getAttribute("data-eidos")
      if (eidosData) {
        // 延迟隐藏，给用户时间移动到 tooltip 上
        if (hoverTimeoutId) {
          clearTimeout(hoverTimeoutId)
        }
        const timeoutId = setTimeout(() => {
          if (!isHovering) {
            hideTooltip()
          }
        }, 200)
        setHoverTimeoutId(timeoutId)
      }
    }

    const handleScroll = () => {
      hideTooltip()
    }

    // Add event listeners to document
    document.addEventListener("mouseover", handleMouseOver)
    document.addEventListener("mouseout", handleMouseOut)
    document.addEventListener("scroll", handleScroll, true)

    return () => {
      document.removeEventListener("mouseover", handleMouseOver)
      document.removeEventListener("mouseout", handleMouseOut)
      document.removeEventListener("scroll", handleScroll, true)
      if (hoverTimeoutId) {
        clearTimeout(hoverTimeoutId)
      }
    }
  }, [isGodMode, isHovering, hoverTimeoutId])

  if (!isGodMode || !tooltip.visible) return null

  // 根据位置确定变换样式
  const getTransformStyle = () => {
    switch (tooltip.position) {
      case "top":
        return "translate(-50%, -100%)"
      case "bottom":
        return "translate(-50%, 0%)"
      case "left":
        return "translate(-100%, -50%)"
      case "right":
        return "translate(0%, -50%)"
      default:
        return "translate(-50%, -100%)"
    }
  }

  // 根据位置确定箭头样式
  const getArrowStyle = () => {
    const arrowSize = 6
    switch (tooltip.position) {
      case "top":
        return {
          position: "absolute" as const,
          bottom: -arrowSize,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderTop: `${arrowSize}px solid var(--foreground)`,
        }
      case "bottom":
        return {
          position: "absolute" as const,
          top: -arrowSize,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid var(--foreground)`,
        }
      case "left":
        return {
          position: "absolute" as const,
          top: "50%",
          right: -arrowSize,
          transform: "translateY(-50%)",
          width: 0,
          height: 0,
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderLeft: `${arrowSize}px solid var(--foreground)`,
        }
      case "right":
        return {
          position: "absolute" as const,
          top: "50%",
          left: -arrowSize,
          transform: "translateY(-50%)",
          width: 0,
          height: 0,
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid var(--foreground)`,
        }
      default:
        return {}
    }
  }

  return createPortal(
    <div
      className="fixed z-[9999]"
      data-tooltip-container
      style={{
        left: tooltip.x,
        top: tooltip.y,
        transform: getTransformStyle(),
      }}
      onMouseEnter={() => {
        setIsHovering(true)
        if (hoverTimeoutId) {
          clearTimeout(hoverTimeoutId)
          setHoverTimeoutId(null)
        }
      }}
      onMouseLeave={() => {
        setIsHovering(false)
        // 给一个短暂的延迟，以防用户快速移回
        const timeoutId = setTimeout(() => {
          hideTooltip()
        }, 150)
        setHoverTimeoutId(timeoutId)
      }}
    >
      <div className="relative bg-foreground text-background px-3 py-2 rounded-lg shadow-lg text-sm font-mono max-w-xs break-words">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">{tooltip.content}</div>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 p-1 hover:bg-background/20 rounded transition-colors"
            title="Copy to clipboard"
          >
            {isCopied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
        <div style={getArrowStyle()} />
      </div>
    </div>,
    document.body
  )
}
