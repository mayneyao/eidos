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

// Hook to collect menu items using refs (avoiding state updates)
const useMenuCollector = () => {
  const itemsRef = React.useRef<Map<string, NativeMenuItem>>(new Map())
  const submenusRef = React.useRef<Map<string, { trigger: NativeMenuItem, items: NativeMenuItem[] }>>(new Map())
  const orderRef = React.useRef<string[]>([])

  const registerItem = React.useCallback((id: string, item: NativeMenuItem, onClick?: () => void) => {
    itemsRef.current.set(id, item)
    if (!orderRef.current.includes(id)) {
      orderRef.current.push(id)
    }
  }, [])

  const unregisterItem = React.useCallback((id: string) => {
    itemsRef.current.delete(id)
    submenusRef.current.delete(id)
    const index = orderRef.current.indexOf(id)
    if (index > -1) {
      orderRef.current.splice(index, 1)
    }
  }, [])

  const registerSubmenu = React.useCallback((triggerId: string, trigger: NativeMenuItem, items: NativeMenuItem[]) => {
    submenusRef.current.set(triggerId, { trigger, items })
    if (!orderRef.current.includes(triggerId)) {
      orderRef.current.push(triggerId)
    }
  }, [])

  const getMenuItems = React.useCallback(() => {
    return orderRef.current.map(id => {
      if (submenusRef.current.has(id)) {
        const submenu = submenusRef.current.get(id)!
        // Assume trigger is a text item
        const trigger = submenu.trigger as { type: 'text', label: string, enabled?: boolean, icon?: string }
        return {
          type: 'submenu' as const,
          label: trigger.label,
          submenu: submenu.items,
          id,
          enabled: trigger.enabled ?? true,
          icon: trigger.icon
        }
      } else {
        return itemsRef.current.get(id)!
      }
    }).filter(Boolean)
  }, [])

  return { registerItem, unregisterItem, registerSubmenu, getMenuItems }
}

// Context to collect menu items
const NativeMenuContext = React.createContext<ReturnType<typeof useMenuCollector> | null>(null)

// Main Native Context Menu component - only for desktop
interface NativeContextMenuProps {
  children: React.ReactNode
  onOpenChange?: (open: boolean) => void
}

const NativeContextMenu: React.FC<NativeContextMenuProps> = ({
  children,
  onOpenChange
}) => {
  const clickHandlersRef = React.useRef<Map<string, () => void>>(new Map())
  const menuCollector = useMenuCollector()

  const menuContextValue = React.useMemo(() => ({
    registerItem: (id: string, item: NativeMenuItem, onClick?: () => void) => {
      menuCollector.registerItem(id, item)
      if (onClick) {
        clickHandlersRef.current.set(id, onClick)
      }
    },
    unregisterItem: (id: string) => {
      menuCollector.unregisterItem(id)
      clickHandlersRef.current.delete(id)
    },
    registerSubmenu: menuCollector.registerSubmenu,
    getMenuItems: menuCollector.getMenuItems,
    registerClickHandler: (id: string, handler: () => void) => {
      clickHandlersRef.current.set(id, handler)
    },
  }), [menuCollector])

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
    </NativeMenuContext.Provider>
  )
}

NativeContextMenu.displayName = "NativeContextMenu"

// Trigger component - supports asChild prop like shadcn components
const NativeContextMenuTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    asChild?: boolean
  }
>(({ asChild = false, children, ...props }, ref) => {
  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement
    return React.cloneElement(child, {
      ref,
      ...props,
    })
  }
  return <div ref={ref} {...props}>{children}</div>
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
  Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
    disabled?: boolean
    onSelect?: (event: any) => void
    onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
    accelerator?: string
  }
>(({ children, disabled, onSelect, onClick, accelerator, ...props }, ref) => {
  const menuContext = React.useContext(NativeMenuContext)
  const itemId = React.useId()

  // Extract text content and accelerator for native menu
  const extractMenuInfo = (children: React.ReactNode): { label: string; accelerator?: string } => {
    let label = ''
    let accelerator: string | undefined

    const processNode = (node: React.ReactNode): void => {
      if (typeof node === 'string') {
        label += node
      } else if (React.isValidElement(node)) {
        // Check if this is a shortcut component
        if (node.type === NativeContextMenuShortcut) {
          accelerator = React.isValidElement(node) ? String(node.props.children || '') : undefined
        } else if (node.props.children) {
          processNode(node.props.children)
        }
      } else if (Array.isArray(node)) {
        node.forEach(processNode)
      }
    }

    processNode(children)
    return { label: label.trim(), accelerator: accelerator || undefined }
  }

  const { label, accelerator: extractedAccelerator } = extractMenuInfo(children)
  const finalAccelerator = accelerator || extractedAccelerator

  React.useEffect(() => {
    if (menuContext && label) {
      const handleAction = () => {
        onSelect?.(new Event('select'))
        onClick?.({} as React.MouseEvent<HTMLDivElement>)
      }
      menuContext.registerItem(itemId, {
        type: 'text',
        label,
        id: itemId,
        enabled: !disabled,
        accelerator: finalAccelerator,
      }, handleAction)
    }

    return () => {
      if (menuContext) {
        menuContext.unregisterItem(itemId)
      }
    }
  }, [menuContext, itemId, label, disabled, onSelect, onClick, finalAccelerator])

  // Handle click events if onClick is provided
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onSelect?.(new Event('select'))
    onClick?.(event)
  }

  // Don't render anything if no onClick provided (pure native menu item)
  if (!onClick) {
    return <div ref={ref} style={{ display: 'none' }} {...props} />
  }

  // Render clickable element if onClick is provided
  return (
    <div
      ref={ref}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
      {...props}
    >
      {children}
    </div>
  )
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

// Submenu collector hook with registration callback
const useSubmenuCollector = (onItemsChange?: () => void) => {
  const itemsRef = React.useRef<Map<string, NativeMenuItem>>(new Map())
  const clickHandlersRef = React.useRef<Map<string, () => void>>(new Map())
  const orderRef = React.useRef<string[]>([])

  const registerItem = React.useCallback((id: string, item: NativeMenuItem, onClick?: () => void) => {
    itemsRef.current.set(id, item)
    if (onClick) {
      clickHandlersRef.current.set(id, onClick)
    }
    if (!orderRef.current.includes(id)) {
      orderRef.current.push(id)
    }
    onItemsChange?.()
  }, [onItemsChange])

  const unregisterItem = React.useCallback((id: string) => {
    itemsRef.current.delete(id)
    clickHandlersRef.current.delete(id)
    const index = orderRef.current.indexOf(id)
    if (index > -1) {
      orderRef.current.splice(index, 1)
    }
    onItemsChange?.()
  }, [onItemsChange])

  const getItems = React.useCallback(() => {
    return orderRef.current.map(id => itemsRef.current.get(id)!).filter(Boolean)
  }, [])

  const getClickHandlers = React.useCallback(() => {
    return clickHandlersRef.current
  }, [])

  return { registerItem, unregisterItem, getItems, getClickHandlers }
}

// Context for submenu items
const NativeSubmenuContext = React.createContext<ReturnType<typeof useSubmenuCollector> | null>(null)

// Context for submenu trigger info
const NativeSubmenuTriggerContext = React.createContext<{
  setTriggerInfo: (info: { label: string; enabled?: boolean; icon?: string }) => void
  triggerInfo: { label: string; enabled?: boolean; icon?: string } | null
} | null>(null)

const NativeContextMenuSub = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  const parentContext = React.useContext(NativeMenuContext)
  const triggerInfoRef = React.useRef<{ label: string; enabled?: boolean; icon?: string } | null>(null)
  const itemId = React.useId()
  const submenuCollectorRef = React.useRef<ReturnType<typeof useSubmenuCollector> | null>(null)

  const checkAndRegister = React.useCallback(() => {
    const submenuCollector = submenuCollectorRef.current
    if (parentContext && triggerInfoRef.current && submenuCollector && submenuCollector.getItems().length > 0) {
      const submenuItems = submenuCollector.getItems()
      const triggerItem = {
        type: 'text' as const,
        label: triggerInfoRef.current.label,
        enabled: triggerInfoRef.current.enabled ?? true,
        icon: triggerInfoRef.current.icon
      }

      // Always update the submenu registration to reflect current items
      parentContext.registerSubmenu(itemId, triggerItem, submenuItems)
      
      // Also register click handlers from submenu items to parent context
      const submenuClickHandlers = submenuCollector.getClickHandlers()
      submenuClickHandlers.forEach((handler, id) => {
        // Access the parent's clickHandlersRef through a custom method
        if ((parentContext as any).registerClickHandler) {
          (parentContext as any).registerClickHandler(id, handler)
        }
      })
    }
  }, [parentContext, itemId])

  const submenuCollector = useSubmenuCollector(checkAndRegister)
  submenuCollectorRef.current = submenuCollector

  const triggerContextValue = React.useMemo(() => ({
    setTriggerInfo: (info: { label: string; enabled?: boolean; icon?: string }) => {
      triggerInfoRef.current = info
      checkAndRegister()
    },
    triggerInfo: triggerInfoRef.current
  }), [checkAndRegister])

  React.useEffect(() => {
    return () => {
      if (parentContext) {
        parentContext.unregisterItem(itemId)
      }
    }
  }, [parentContext, itemId])

  return (
    <NativeSubmenuTriggerContext.Provider value={triggerContextValue}>
      <NativeSubmenuContext.Provider value={submenuCollector}>
        <div ref={ref} style={{ display: 'none' }} {...props}>
          {children}
        </div>
      </NativeSubmenuContext.Provider>
    </NativeSubmenuTriggerContext.Provider>
  )
})
NativeContextMenuSub.displayName = "NativeContextMenuSub"

const NativeContextMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  const submenuContext = React.useContext(NativeSubmenuContext)
  const parentContext = React.useContext(NativeMenuContext)

  const menuContextValue = React.useMemo(() => ({
    registerItem: submenuContext?.registerItem || (() => {}),
    unregisterItem: submenuContext?.unregisterItem || (() => {}),
    registerSubmenu: () => {}, // Submenus don't support nested submenus
    getMenuItems: submenuContext?.getItems || (() => []),
    registerClickHandler: (parentContext as any)?.registerClickHandler || (() => {}),
  }), [submenuContext, parentContext])

  return (
    <NativeMenuContext.Provider value={menuContextValue}>
      <div ref={ref} style={{ display: 'none' }} {...props}>
        {children}
      </div>
    </NativeMenuContext.Provider>
  )
})
NativeContextMenuSubContent.displayName = "NativeContextMenuSubContent"

const NativeContextMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  const triggerContext = React.useContext(NativeSubmenuTriggerContext)

  // Extract text content for submenu trigger
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

  // Set trigger info
  React.useEffect(() => {
    if (triggerContext && label) {
      triggerContext.setTriggerInfo({
        label,
        enabled: true,
      })
    }
  }, [triggerContext, label])

  return <div ref={ref} style={{ display: 'none' }} {...props} />
})
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
