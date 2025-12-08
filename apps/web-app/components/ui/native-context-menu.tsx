import * as React from "react"

// Native menu item types - import from shared types
type NativeMenuItem =
  | {
      type: 'text'
      label: string
      id?: string
      enabled?: boolean
      accelerator?: string
      icon?: string
  }
  | {
      type: 'separator'
  }
  | {
      type: 'submenu'
      label: string
      submenu: NativeMenuItem[]
      id?: string
      enabled?: boolean
      icon?: string
  }
  | {
      type: 'checkbox'
      label: string
      checked?: boolean
      id?: string
      enabled?: boolean
  }
  | {
      type: 'radio'
      label: string
      checked?: boolean
      id?: string
      enabled?: boolean
  }

// Context to collect menu items
const NativeMenuContext = React.createContext<{
  registerItem: (id: string, item: NativeMenuItem, onClick?: () => void) => void
  unregisterItem: (id: string) => void
  getMenuItems: () => NativeMenuItem[]
} | null>(null)

// Main Native Context Menu component - only for desktop
interface NativeContextMenuProps {
  children: React.ReactNode
  onOpenChange?: (open: boolean) => void
}

const NativeContextMenu = React.forwardRef<
  HTMLDivElement,
  NativeContextMenuProps
>(({ children, onOpenChange }, ref) => {
  const menuItemsRef = React.useRef<Map<string, NativeMenuItem>>(new Map())
  const clickHandlersRef = React.useRef<Map<string, () => void>>(new Map())

  const menuContextValue = React.useMemo(() => ({
    registerItem: (id: string, item: NativeMenuItem, onClick?: () => void) => {
      menuItemsRef.current.set(id, item)
      if (onClick) {
        clickHandlersRef.current.set(id, onClick)
      }
    },
    unregisterItem: (id: string) => {
      menuItemsRef.current.delete(id)
      clickHandlersRef.current.delete(id)
    },
    getMenuItems: () => Array.from(menuItemsRef.current.values())
  }), [])

  // Listen for menu click events from main process
  React.useEffect(() => {
    const handleMenuClick = (_: any, itemId: string) => {
      const clickHandler = clickHandlersRef.current.get(itemId)
      if (clickHandler) {
        clickHandler()
      }
    }

    let listenerId: string | undefined
    if (window.eidos?.on) {
      listenerId = window.eidos.on('native-menu-click', handleMenuClick)
    }

    return () => {
      if (window.eidos?.off && listenerId) {
        window.eidos.off('native-menu-click', listenerId)
      }
    }
  }, [])

  return (
    <NativeMenuContext.Provider value={menuContextValue}>
      <div ref={ref}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child) && child.type === NativeContextMenuTrigger) {
            return React.cloneElement(child, {
              ...child.props,
              onContextMenu: async (event: React.MouseEvent) => {
                event.preventDefault()

                // Show native menu with collected items
                const menuItems = menuContextValue.getMenuItems()
                if (menuItems.length > 0 && window.eidos?.showNativeMenu) {
                  try {
                    // Create a simple position object instead of passing the full event
                    const position = event ? { clientX: event.clientX, clientY: event.clientY } : undefined
                    await window.eidos.showNativeMenu(menuItems, position)
                    onOpenChange?.(true)
                  } catch (error) {
                    console.error('Failed to show native context menu:', error)
                  }
                }

                child.props.onContextMenu?.(event)
              }
            })
          }
          return child
        })}
      </div>
    </NativeMenuContext.Provider>
  )
})
NativeContextMenu.displayName = "NativeContextMenu"

// Trigger component
const NativeContextMenuTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  return <div ref={ref} {...props} />
})
NativeContextMenuTrigger.displayName = "NativeContextMenuTrigger"

// Content component - collects menu items but renders invisibly
const NativeContextMenuContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  // Render children invisibly to allow them to register with context
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: '-9999px',
        top: '-9999px',
        visibility: 'hidden',
        pointerEvents: 'none'
      }}
      {...props}
    >
      {children}
    </div>
  )
})
NativeContextMenuContent.displayName = "NativeContextMenuContent"

// Item component - registers with context
const NativeContextMenuItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    disabled?: boolean
    onSelect?: (event: Event) => void
  }
>(({ children, disabled, onSelect, ...props }, ref) => {
  const menuContext = React.useContext(NativeMenuContext)
  const itemId = React.useId()

  // Extract text content for native menu
  const getTextContent = (children: React.ReactNode): string => {
    if (typeof children === 'string') return children
    if (React.isValidElement(children)) {
      return getTextContent(children.props.children)
    }
    if (Array.isArray(children)) {
      return children.map(getTextContent).join('')
    }
    return ''
  }

  const label = getTextContent(children)

  React.useEffect(() => {
    if (menuContext && label) {
      menuContext.registerItem(itemId, {
        type: 'text',
        label,
        id: itemId,
        enabled: !disabled,
      }, () => onSelect?.(new Event('select')))
    }

    return () => {
      if (menuContext) {
        menuContext.unregisterItem(itemId)
      }
    }
  }, [menuContext, itemId, label, disabled, onSelect])

  // Don't render anything
  return <div ref={ref} style={{ display: 'none' }} {...props} />
})
NativeContextMenuItem.displayName = "NativeContextMenuItem"

// Checkbox item component
const NativeContextMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    checked?: boolean
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
  }
>(({ children, checked, disabled, onCheckedChange, ...props }, ref) => {
  const menuContext = React.useContext(NativeMenuContext)
  const itemId = React.useId()

  const getTextContent = (children: React.ReactNode): string => {
    if (typeof children === 'string') return children
    if (React.isValidElement(children)) {
      return getTextContent(children.props.children)
    }
    if (Array.isArray(children)) {
      return children.map(getTextContent).join('')
    }
    return ''
  }

  const label = getTextContent(children)

  React.useEffect(() => {
    if (menuContext && label) {
      menuContext.registerItem(itemId, {
        type: 'checkbox',
        label,
        checked,
        id: itemId,
        enabled: !disabled,
      }, () => onCheckedChange?.(!checked))
    }

    return () => {
      if (menuContext) {
        menuContext.unregisterItem(itemId)
      }
    }
  }, [menuContext, itemId, label, checked, disabled, onCheckedChange])

  return <div ref={ref} style={{ display: 'none' }} {...props} />
})
NativeContextMenuCheckboxItem.displayName = "NativeContextMenuCheckboxItem"

// Radio item component
const NativeContextMenuRadioItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    disabled?: boolean
  }
>(({ children, disabled, ...props }, ref) => {
  const menuContext = React.useContext(NativeMenuContext)
  const itemId = React.useId()

  const getTextContent = (children: React.ReactNode): string => {
    if (typeof children === 'string') return children
    if (React.isValidElement(children)) {
      return getTextContent(children.props.children)
    }
    if (Array.isArray(children)) {
      return children.map(getTextContent).join('')
    }
    return ''
  }

  const label = getTextContent(children)

  React.useEffect(() => {
    if (menuContext && label) {
      menuContext.registerItem(itemId, {
        type: 'radio',
        label,
        id: itemId,
        enabled: !disabled,
      })
    }

    return () => {
      if (menuContext) {
        menuContext.unregisterItem(itemId)
      }
    }
  }, [menuContext, itemId, label, disabled])

  return <div ref={ref} style={{ display: 'none' }} {...props} />
})
NativeContextMenuRadioItem.displayName = "NativeContextMenuRadioItem"

// Separator component
const NativeContextMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const menuContext = React.useContext(NativeMenuContext)
  const itemId = React.useId()

  React.useEffect(() => {
    if (menuContext) {
      menuContext.registerItem(itemId, {
        type: 'separator',
      })
    }

    return () => {
      if (menuContext) {
        menuContext.unregisterItem(itemId)
      }
    }
  }, [menuContext, itemId])

  return <div ref={ref} style={{ display: 'none' }} {...props} />
})
NativeContextMenuSeparator.displayName = "NativeContextMenuSeparator"

// Placeholder components for compatibility - these don't render anything in desktop
const NativeContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <div ref={ref} style={{ display: 'none' }} {...props} />)
NativeContextMenuLabel.displayName = "NativeContextMenuLabel"

const NativeContextMenuShortcut = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>((props, ref) => <span ref={ref} style={{ display: 'none' }} {...props} />)
NativeContextMenuShortcut.displayName = "NativeContextMenuShortcut"

const NativeContextMenuGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <div ref={ref} style={{ display: 'none' }} {...props} />)
NativeContextMenuGroup.displayName = "NativeContextMenuGroup"

const NativeContextMenuPortal = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <div ref={ref} style={{ display: 'none' }} {...props} />)
NativeContextMenuPortal.displayName = "NativeContextMenuPortal"

const NativeContextMenuSub = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <div ref={ref} style={{ display: 'none' }} {...props} />)
NativeContextMenuSub.displayName = "NativeContextMenuSub"

const NativeContextMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <div ref={ref} style={{ display: 'none' }} {...props} />)
NativeContextMenuSubContent.displayName = "NativeContextMenuSubContent"

const NativeContextMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <div ref={ref} style={{ display: 'none' }} {...props} />)
NativeContextMenuSubTrigger.displayName = "NativeContextMenuSubTrigger"

const NativeContextMenuRadioGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <div ref={ref} style={{ display: 'none' }} {...props} />)
NativeContextMenuRadioGroup.displayName = "NativeContextMenuRadioGroup"

export {
  NativeContextMenu,
  NativeContextMenuTrigger,
  NativeContextMenuContent,
  NativeContextMenuItem,
  NativeContextMenuCheckboxItem,
  NativeContextMenuRadioItem,
  NativeContextMenuLabel,
  NativeContextMenuSeparator,
  NativeContextMenuShortcut,
  NativeContextMenuGroup,
  NativeContextMenuPortal,
  NativeContextMenuSub,
  NativeContextMenuSubContent,
  NativeContextMenuSubTrigger,
  NativeContextMenuRadioGroup,
}
