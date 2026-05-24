"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

// Sidebar context for managing open state and width
interface SidebarContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  width: number
  setWidth: (width: number) => void
  isResizing: boolean
  setIsResizing: (isResizing: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(
  undefined
)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

// Default sidebar width in pixels
const DEFAULT_WIDTH = 320
const MIN_WIDTH = 200
const getMaxWidth = () => Math.floor(window.innerWidth / 2)

// Sidebar Provider
interface SidebarProviderProps {
  children: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SidebarProvider({
  children,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
}: SidebarProviderProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const [width, setWidthState] = React.useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = React.useState(false)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setInternalOpen(value)
      }
      onOpenChange?.(value)
    },
    [isControlled, onOpenChange]
  )

  const toggle = React.useCallback(() => {
    setOpen(!open)
  }, [open, setOpen])

  const setWidth = React.useCallback((newWidth: number) => {
    const clampedWidth = Math.max(MIN_WIDTH, Math.min(getMaxWidth(), newWidth))
    setWidthState(clampedWidth)
  }, [])

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      width,
      setWidth,
      isResizing,
      setIsResizing,
    }),
    [open, setOpen, toggle, width, setWidth, isResizing, setIsResizing]
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}

// Sidebar Main Component
interface SidebarProps {
  children: React.ReactNode
  className?: string
}

export function Sidebar({ children, className }: SidebarProps) {
  const { open, width, isResizing } = useSidebar()

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden shrink-0",
        !isResizing && "transition-[width] duration-300 ease-in-out"
      )}
      style={{ width: open ? width : 0 }}
    >
      <div
        data-state={open ? "expanded" : "collapsed"}
        className={cn(
          "group/sidebar absolute inset-0 flex h-full flex-col overflow-hidden bg-sidebar",
          !isResizing && "transition-transform duration-300 ease-in-out",
          !open && "-translate-x-full",
          className
        )}
        style={{ width }}
      >
        {children}
      </div>
      <SidebarRail />
    </div>
  )
}

// Sidebar Rail - Resize handle only
function SidebarRail() {
  const { open, width, setWidth, setIsResizing } = useSidebar()
  const startXRef = React.useRef(0)
  const startWidthRef = React.useRef(width)

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsResizing(true)
      startXRef.current = e.clientX
      startWidthRef.current = width

      // Add global overlay to prevent webview from swallowing events
      const overlay = document.createElement("div")
      overlay.id = "sidebar-drag-overlay"
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
        cursor: col-resize;
      `
      document.body.appendChild(overlay)

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - startXRef.current
        const newWidth = startWidthRef.current + delta
        setWidth(newWidth)
      }

      const handleMouseUp = () => {
        setIsResizing(false)
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        const overlay = document.getElementById("sidebar-drag-overlay")
        overlay?.remove()
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [width, setWidth, setIsResizing]
  )

  if (!open) return null

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "absolute right-0 top-0 bottom-0 z-50 w-[2px] cursor-col-resize",
        "hover:bg-primary/20 hover:w-1",
        "active:bg-primary/30 active:w-1",
        "transition-all duration-150"
      )}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      title="拖拽调整宽度"
    >
      {/* Visual line indicator */}
      <div className="absolute right-0 top-0 bottom-0 w-px bg-border" />
    </div>
  )
}

// Sidebar Header
interface SidebarHeaderProps {
  children: React.ReactNode
  className?: string
}

export function SidebarHeader({ children, className }: SidebarHeaderProps) {
  const { open } = useSidebar()

  return (
    <div
      className={cn(
        "flex flex-col border-b border-sidebar-border px-3 py-2",
        !open && "items-center px-2",
        className
      )}
    >
      {children}
    </div>
  )
}

// Sidebar Content - Scrollable content area
interface SidebarContentProps {
  children: React.ReactNode
  className?: string
}

export function SidebarContent({ children, className }: SidebarContentProps) {
  return (
    <div className={cn("flex-1 overflow-auto px-3 py-2", className)}>
      {children}
    </div>
  )
}

// Sidebar Footer
interface SidebarFooterProps {
  children: React.ReactNode
  className?: string
}

export function SidebarFooter({ children, className }: SidebarFooterProps) {
  const { open } = useSidebar()

  return (
    <div
      className={cn(
        "border-t border-sidebar-border p-3",
        !open && "px-2",
        className
      )}
    >
      {children}
    </div>
  )
}

// Sidebar Group
interface SidebarGroupProps {
  children: React.ReactNode
  className?: string
}

export function SidebarGroup({ children, className }: SidebarGroupProps) {
  return (
    <div className={cn("flex flex-col gap-1 py-2", className)}>{children}</div>
  )
}

// Sidebar Group Label
interface SidebarGroupLabelProps {
  children: React.ReactNode
  className?: string
}

export function SidebarGroupLabel({
  children,
  className,
}: SidebarGroupLabelProps) {
  const { open } = useSidebar()

  if (!open) return null

  return (
    <div
      className={cn(
        "px-2 py-1 text-xs font-medium text-sidebar-foreground/60",
        className
      )}
    >
      {children}
    </div>
  )
}

// Sidebar Menu
interface SidebarMenuProps {
  children: React.ReactNode
  className?: string
}

export function SidebarMenu({ children, className }: SidebarMenuProps) {
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>
}

// Sidebar Menu Item
interface SidebarMenuItemProps {
  children: React.ReactNode
  className?: string
}

export function SidebarMenuItem({ children, className }: SidebarMenuItemProps) {
  return <div className={cn("relative", className)}>{children}</div>
}

// Sidebar Menu Button
interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string
}

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  SidebarMenuButtonProps
>(({ className, children, isActive, asChild = false, ...props }, ref) => {
  const { open } = useSidebar()
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-active={isActive}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-sidebar-ring",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        !open && "justify-center px-1",
        className
      )}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      {...props}
    >
      {children}
    </Comp>
  )
})
SidebarMenuButton.displayName = "SidebarMenuButton"

// Sidebar Separator
interface SidebarSeparatorProps {
  className?: string
}

export function SidebarSeparator({ className }: SidebarSeparatorProps) {
  return <div className={cn("my-2 h-px w-full bg-sidebar-border", className)} />
}
