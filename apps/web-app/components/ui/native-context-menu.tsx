import * as React from "react"
import { cn } from "@/lib/utils"
import { isWindowsDesktop } from "@/lib/web/helper"
import {
  ContextMenu,
  ContextMenuCheckboxItem as RadixContextMenuCheckboxItem,
  ContextMenuContent as RadixContextMenuContent,
  ContextMenuGroup as RadixContextMenuGroup,
  ContextMenuItem as RadixContextMenuItem,
  ContextMenuLabel as RadixContextMenuLabel,
  ContextMenuPortal as RadixContextMenuPortal,
  ContextMenuRadioGroup as RadixContextMenuRadioGroup,
  ContextMenuRadioItem as RadixContextMenuRadioItem,
  ContextMenuSeparator as RadixContextMenuSeparator,
  ContextMenuShortcut as RadixContextMenuShortcut,
  ContextMenuSub as RadixContextMenuSub,
  ContextMenuSubContent as RadixContextMenuSubContent,
  ContextMenuSubTrigger as RadixContextMenuSubTrigger,
  ContextMenuTrigger as RadixContextMenuTrigger,
} from "./context-menu"

// Native menu item types - import from shared types
export type NativeMenuItem =
  | {
      type: "text"
      label: string
      id?: string
      enabled?: boolean
      accelerator?: string
      icon?: string
    }
  | {
      type: "separator"
    }
  | {
      type: "submenu"
      label: string
      submenu: NativeMenuItem[]
      id?: string
      enabled?: boolean
      icon?: string
    }
  | {
      type: "checkbox"
      label: string
      checked?: boolean
      id?: string
      enabled?: boolean
    }
  | {
      type: "radio"
      label: string
      checked?: boolean
      id?: string
      enabled?: boolean
    }

const isNativeMenuItem = (
  item: NativeMenuItem | null | undefined
): item is NativeMenuItem => Boolean(item)

type NativeMenuItemsSource = NativeMenuItem[] | (() => NativeMenuItem[])

// Hook to collect menu items using refs (avoiding state updates)
const useMenuCollector = () => {
  const itemsRef = React.useRef<Map<string, NativeMenuItem>>(new Map())
  const submenusRef = React.useRef<
    Map<string, { trigger: NativeMenuItem; items: NativeMenuItemsSource }>
  >(new Map())
  const orderRef = React.useRef<string[]>([])
  const labelIndexRef = React.useRef<Map<string, string>>(new Map())

  const getDedupeKey = React.useCallback((item: NativeMenuItem) => {
    if (item.type === "separator") return null
    if (item.type === "submenu") return `submenu:${item.label}`
    if ("label" in item && item.label) {
      return `${item.type}:${item.label}`
    }
    return null
  }, [])

  const removeById = React.useCallback((id: string) => {
    itemsRef.current.delete(id)
    submenusRef.current.delete(id)
    const index = orderRef.current.indexOf(id)
    if (index > -1) {
      orderRef.current.splice(index, 1)
    }
    // Remove any label index pointing to this id
    labelIndexRef.current.forEach((value, key) => {
      if (value === id) {
        labelIndexRef.current.delete(key)
      }
    })
  }, [])

  React.useEffect(() => {
    return () => {
      itemsRef.current.clear()
      submenusRef.current.clear()
      orderRef.current = []
      labelIndexRef.current.clear()
    }
  }, [])

  const registerItem = React.useCallback(
    (id: string, item: NativeMenuItem, onClick?: () => void) => {
      // Ensure stale registrations are removed before adding the latest one
      removeById(id)

      const dedupeKey = getDedupeKey(item)
      if (dedupeKey) {
        const existingId = labelIndexRef.current.get(dedupeKey)
        if (existingId && existingId !== id) {
          removeById(existingId)
        }
        labelIndexRef.current.set(dedupeKey, id)
      }

      itemsRef.current.set(id, item)
      if (!orderRef.current.includes(id)) {
        orderRef.current.push(id)
      }
    },
    [getDedupeKey, removeById]
  )

  const unregisterItem = React.useCallback(
    (id: string) => {
      removeById(id)
    },
    [removeById]
  )

  const registerSubmenu = React.useCallback(
    (
      triggerId: string,
      trigger: NativeMenuItem,
      items: NativeMenuItemsSource
    ) => {
      removeById(triggerId)

      const dedupeKey = getDedupeKey(trigger)
      if (dedupeKey) {
        const existingId = labelIndexRef.current.get(dedupeKey)
        if (existingId && existingId !== triggerId) {
          removeById(existingId)
        }
        labelIndexRef.current.set(dedupeKey, triggerId)
      }

      submenusRef.current.set(triggerId, { trigger, items })
      if (!orderRef.current.includes(triggerId)) {
        orderRef.current.push(triggerId)
      }
    },
    [getDedupeKey, removeById]
  )

  const getMenuItems = React.useCallback<() => NativeMenuItem[]>(() => {
    const seenIds = new Set<string>()

    return orderRef.current
      .map((id) => {
        if (seenIds.has(id)) {
          return null
        }
        seenIds.add(id)

        if (submenusRef.current.has(id)) {
          const submenu = submenusRef.current.get(id)!
          // Assume trigger is a text item
          const trigger = submenu.trigger as {
            type: "text"
            label: string
            enabled?: boolean
            icon?: string
          }
          return {
            type: "submenu" as const,
            label: trigger.label,
            submenu:
              typeof submenu.items === "function"
                ? submenu.items()
                : submenu.items,
            id,
            enabled: trigger.enabled ?? true,
            icon: trigger.icon,
          }
        } else {
          return itemsRef.current.get(id)!
        }
      })
      .filter(isNativeMenuItem)
  }, [])

  // Clear all registered items - useful for refreshing menu state
  const clearAll = React.useCallback(() => {
    itemsRef.current.clear()
    submenusRef.current.clear()
    orderRef.current = []
    labelIndexRef.current.clear()
  }, [])

  return {
    registerItem,
    unregisterItem,
    registerSubmenu,
    getMenuItems,
    clearAll,
  }
}

// Context to collect menu items
type NativeMenuContextValue = ReturnType<typeof useMenuCollector> & {
  registerClickHandler?: (id: string, handler: () => void) => void
  unregisterClickHandler?: (id: string) => void
  registerBatchClickHandler?: (
    id: string,
    handler: (itemId: string) => void
  ) => void
  unregisterBatchClickHandler?: (id: string) => void
}

const NativeMenuContext = React.createContext<NativeMenuContextValue | null>(
  null
)
const NativeMenuModeContext = React.createContext<{ useNative: boolean }>({
  useNative: true,
})

// Global click handler registry - singleton pattern to avoid memory leak
// Each menu component registers its handlers here, and a single IPC listener dispatches to them
const globalClickHandlerRegistry = new Map<string, () => void>()
const globalBatchClickHandlerRegistry = new Map<
  string,
  (itemId: string) => void
>()
const NATIVE_MENU_BATCH_SEPARATOR = "::eidos-native-menu-batch::"

// Singleton IPC listener - only initialized once
let globalListenerInitialized = false
const initGlobalMenuClickListener = () => {
  if (globalListenerInitialized) return
  if (typeof window === "undefined" || !window.eidos?.on) return

  globalListenerInitialized = true
  window.eidos.on("native-menu-click", (_: any, itemId: string) => {
    const clickHandler = globalClickHandlerRegistry.get(itemId)
    if (clickHandler) {
      clickHandler()
      return
    }
    const separatorIndex = itemId.lastIndexOf(NATIVE_MENU_BATCH_SEPARATOR)
    if (separatorIndex < 0) return
    const batchId = itemId.slice(0, separatorIndex)
    globalBatchClickHandlerRegistry.get(batchId)?.(itemId)
  })
}

// Main Native Context Menu component - only for desktop
interface NativeContextMenuProps {
  children: React.ReactNode
  onOpenChange?: (open: boolean) => void
}

const NativeContextMenu: React.FC<NativeContextMenuProps> = ({
  children,
  onOpenChange,
}) => {
  const detectNativeMenu = React.useCallback(() => {
    if (typeof window === "undefined") return false
    try {
      return Boolean(window.eidos?.showNativeMenu)
    } catch {
      return false
    }
  }, [])

  const [useNativeMenu, setUseNativeMenu] =
    React.useState<boolean>(detectNativeMenu)

  React.useEffect(() => {
    setUseNativeMenu(detectNativeMenu())
  }, [detectNativeMenu])

  const menuCollector = useMenuCollector()
  // Track registered handler IDs for cleanup
  const registeredHandlerIds = React.useRef<Set<string>>(new Set())
  const registeredBatchHandlerIds = React.useRef<Set<string>>(new Set())

  const menuContextValue = React.useMemo(
    () => ({
      registerItem: (
        id: string,
        item: NativeMenuItem,
        onClick?: () => void
      ) => {
        menuCollector.registerItem(id, item)
        if (onClick) {
          globalClickHandlerRegistry.set(id, onClick)
          registeredHandlerIds.current.add(id)
        }
      },
      unregisterItem: (id: string) => {
        menuCollector.unregisterItem(id)
        globalClickHandlerRegistry.delete(id)
        registeredHandlerIds.current.delete(id)
      },
      registerSubmenu: menuCollector.registerSubmenu,
      getMenuItems: menuCollector.getMenuItems,
      clearAll: () => {
        menuCollector.clearAll()
        // Clean up only handlers registered by this component
        registeredHandlerIds.current.forEach((id) => {
          globalClickHandlerRegistry.delete(id)
        })
        registeredHandlerIds.current.clear()
        registeredBatchHandlerIds.current.forEach((id) => {
          globalBatchClickHandlerRegistry.delete(id)
        })
        registeredBatchHandlerIds.current.clear()
      },
      registerClickHandler: (id: string, handler: () => void) => {
        globalClickHandlerRegistry.set(id, handler)
        registeredHandlerIds.current.add(id)
      },
      unregisterClickHandler: (id: string) => {
        globalClickHandlerRegistry.delete(id)
        registeredHandlerIds.current.delete(id)
      },
      registerBatchClickHandler: (
        id: string,
        handler: (itemId: string) => void
      ) => {
        globalBatchClickHandlerRegistry.set(id, handler)
        registeredBatchHandlerIds.current.add(id)
      },
      unregisterBatchClickHandler: (id: string) => {
        globalBatchClickHandlerRegistry.delete(id)
        registeredBatchHandlerIds.current.delete(id)
      },
    }),
    [menuCollector]
  )

  // Initialize global listener once
  React.useEffect(() => {
    initGlobalMenuClickListener()

    // Cleanup handlers registered by this component when unmounting
    return () => {
      registeredHandlerIds.current.forEach((id) => {
        globalClickHandlerRegistry.delete(id)
      })
      registeredHandlerIds.current.clear()
      registeredBatchHandlerIds.current.forEach((id) => {
        globalBatchClickHandlerRegistry.delete(id)
      })
      registeredBatchHandlerIds.current.clear()
    }
  }, [])

  if (!useNativeMenu) {
    return (
      <NativeMenuModeContext.Provider value={{ useNative: false }}>
        <ContextMenu onOpenChange={onOpenChange}>{children}</ContextMenu>
      </NativeMenuModeContext.Provider>
    )
  }

  return (
    <NativeMenuModeContext.Provider value={{ useNative: true }}>
      <NativeMenuContext.Provider value={menuContextValue}>
        {React.Children.map(children, (child) => {
          if (
            React.isValidElement(child) &&
            child.type === NativeContextMenuTrigger
          ) {
            return React.cloneElement(child, {
              ...child.props,
              onContextMenu: async (event: React.MouseEvent) => {
                event.preventDefault()

                // Show native menu with collected items
                const menuItems = menuContextValue.getMenuItems()
                if (menuItems.length > 0 && window.eidos?.showNativeMenu) {
                  try {
                    // Create a simple position object instead of passing the full event
                    const position = event
                      ? { clientX: event.clientX, clientY: event.clientY }
                      : undefined
                    await window.eidos.showNativeMenu(menuItems, position)
                    onOpenChange?.(true)
                  } catch (error) {
                    console.error("Failed to show native context menu:", error)
                  }
                }

                child.props.onContextMenu?.(event)
              },
            })
          }
          return child
        })}
      </NativeMenuContext.Provider>
    </NativeMenuModeContext.Provider>
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
  const { useNative } = React.useContext(NativeMenuModeContext)

  if (!useNative) {
    if (asChild) {
      return (
        <RadixContextMenuTrigger asChild ref={ref as any} {...props}>
          {children}
        </RadixContextMenuTrigger>
      )
    }
    return (
      <RadixContextMenuTrigger ref={ref as any} {...props}>
        {children}
      </RadixContextMenuTrigger>
    )
  }

  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement
    return React.cloneElement(child, {
      ref,
      ...props,
    })
  }
  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  )
})
NativeContextMenuTrigger.displayName = "NativeContextMenuTrigger"

// Content component - collects menu items but renders invisibly
const NativeContextMenuContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  const { useNative } = React.useContext(NativeMenuModeContext)

  if (!useNative) {
    return (
      <RadixContextMenuContent ref={ref as any} {...props}>
        {children}
      </RadixContextMenuContent>
    )
  }

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: "-9999px",
        top: "-9999px",
        visibility: "hidden",
        pointerEvents: "none",
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
  Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> & {
    disabled?: boolean
    onSelect?: (event: any) => void
    onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
    accelerator?: string
  }
>(({ children, disabled, onSelect, onClick, accelerator, ...props }, ref) => {
  const menuContext = React.useContext(NativeMenuContext)
  const itemId = React.useId()
  const { useNative } = React.useContext(NativeMenuModeContext)

  // Extract text content and accelerator for native menu
  const extractMenuInfo = (
    children: React.ReactNode
  ): { label: string; accelerator?: string } => {
    let label = ""
    let accelerator: string | undefined

    const processNode = (node: React.ReactNode): void => {
      if (typeof node === "string") {
        label += node
      } else if (React.isValidElement(node)) {
        // Check if this is a shortcut component
        if (node.type === NativeContextMenuShortcut) {
          accelerator = React.isValidElement(node)
            ? String(node.props.children || "")
            : undefined
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
    if (!useNative) return

    if (menuContext && label) {
      const handleAction = () => {
        onSelect?.(new Event("select"))
        onClick?.({} as React.MouseEvent<HTMLDivElement>)
      }
      menuContext.registerItem(
        itemId,
        {
          type: "text",
          label,
          id: itemId,
          enabled: !disabled,
          accelerator: finalAccelerator,
        },
        handleAction
      )
    }

    return () => {
      if (menuContext) {
        menuContext.unregisterItem(itemId)
      }
    }
  }, [
    menuContext,
    itemId,
    label,
    disabled,
    onSelect,
    onClick,
    finalAccelerator,
    useNative,
  ])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onSelect?.(new Event("select"))
    onClick?.(event)
  }

  if (!useNative) {
    return (
      <RadixContextMenuItem
        ref={ref as any}
        disabled={disabled}
        onSelect={(event) => {
          onSelect?.(event as any)
          onClick?.(event as any)
        }}
        {...props}
      >
        {children}
      </RadixContextMenuItem>
    )
  }

  if (!onClick) {
    return <div ref={ref} style={{ display: "none" }} {...props} />
  }

  return (
    <div
      ref={ref}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
      {...props}
    >
      {children}
    </div>
  )
})
NativeContextMenuItem.displayName = "NativeContextMenuItem"

type NativeContextMenuCheckboxItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof RadixContextMenuCheckboxItem>,
  "checked" | "onCheckedChange"
> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

// Checkbox item component
const NativeContextMenuCheckboxItem: React.ForwardRefExoticComponent<
  NativeContextMenuCheckboxItemProps & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<HTMLDivElement, NativeContextMenuCheckboxItemProps>(
  (
    { children, checked, disabled, onCheckedChange, onSelect, ...props },
    ref
  ) => {
    const menuContext = React.useContext(NativeMenuContext)
    const itemId = React.useId()
    const { useNative } = React.useContext(NativeMenuModeContext)

    const getTextContent = (children: React.ReactNode): string => {
      if (typeof children === "string") return children
      if (React.isValidElement(children)) {
        return getTextContent(children.props.children)
      }
      if (Array.isArray(children)) {
        return children.map(getTextContent).join("")
      }
      return ""
    }

    const label = getTextContent(children)

    React.useEffect(() => {
      if (!useNative) return
      if (menuContext && label) {
        menuContext.registerItem(
          itemId,
          {
            type: "checkbox",
            label,
            checked,
            id: itemId,
            enabled: !disabled,
          },
          () => {
            onSelect?.(new Event("select"))
            onCheckedChange?.(!checked)
          }
        )
      }

      return () => {
        if (menuContext) {
          menuContext.unregisterItem(itemId)
        }
      }
    }, [
      menuContext,
      itemId,
      label,
      checked,
      disabled,
      onCheckedChange,
      onSelect,
      useNative,
    ])

    if (!useNative) {
      return (
        <RadixContextMenuCheckboxItem
          ref={ref as any}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          onSelect={onSelect}
          {...props}
        >
          {children}
        </RadixContextMenuCheckboxItem>
      )
    }

    return <div ref={ref} style={{ display: "none" }} {...props} />
  }
)
NativeContextMenuCheckboxItem.displayName = "NativeContextMenuCheckboxItem"

type NativeContextMenuRadioItemProps = React.ComponentPropsWithoutRef<
  typeof RadixContextMenuRadioItem
>

// Radio item component
const NativeContextMenuRadioItem: React.ForwardRefExoticComponent<
  NativeContextMenuRadioItemProps & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<HTMLDivElement, NativeContextMenuRadioItemProps>(
  ({ children, disabled, value, onSelect, ...props }, ref) => {
    const menuContext = React.useContext(NativeMenuContext)
    const itemId = React.useId()
    const { useNative } = React.useContext(NativeMenuModeContext)

    const getTextContent = (children: React.ReactNode): string => {
      if (typeof children === "string") return children
      if (React.isValidElement(children)) {
        return getTextContent(children.props.children)
      }
      if (Array.isArray(children)) {
        return children.map(getTextContent).join("")
      }
      return ""
    }

    const label = getTextContent(children)

    React.useEffect(() => {
      if (!useNative) return
      if (menuContext && label) {
        menuContext.registerItem(
          itemId,
          {
            type: "radio",
            label,
            id: itemId,
            enabled: !disabled,
          },
          () => onSelect?.(new Event("select"))
        )
      }

      return () => {
        if (menuContext) {
          menuContext.unregisterItem(itemId)
        }
      }
    }, [menuContext, itemId, label, disabled, onSelect, useNative])

    if (!useNative) {
      return (
        <RadixContextMenuRadioItem
          ref={ref as any}
          disabled={disabled}
          value={value}
          onSelect={onSelect}
          {...props}
        >
          {children}
        </RadixContextMenuRadioItem>
      )
    }

    return <div ref={ref} style={{ display: "none" }} {...props} />
  }
)
NativeContextMenuRadioItem.displayName = "NativeContextMenuRadioItem"

// Separator component
const NativeContextMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const menuContext = React.useContext(NativeMenuContext)
  const itemId = React.useId()
  const { useNative } = React.useContext(NativeMenuModeContext)

  React.useEffect(() => {
    if (!useNative) return
    if (menuContext) {
      menuContext.registerItem(itemId, {
        type: "separator",
      })
    }

    return () => {
      if (menuContext) {
        menuContext.unregisterItem(itemId)
      }
    }
  }, [menuContext, itemId, useNative])

  if (!useNative) {
    return <RadixContextMenuSeparator ref={ref as any} {...props} />
  }

  return <div ref={ref} style={{ display: "none" }} {...props} />
})
NativeContextMenuSeparator.displayName = "NativeContextMenuSeparator"

// Placeholder components for compatibility - these don't render anything in desktop
const NativeContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { useNative } = React.useContext(NativeMenuModeContext)
  if (!useNative) {
    return <RadixContextMenuLabel ref={ref as any} {...props} />
  }
  return <div ref={ref} style={{ display: "none" }} {...props} />
})
NativeContextMenuLabel.displayName = "NativeContextMenuLabel"

const NativeContextMenuShortcut = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => {
  const { useNative } = React.useContext(NativeMenuModeContext)
  if (!useNative) {
    return (
      <span
        ref={ref}
        className={cn(
          "ml-auto text-xs tracking-widest text-muted-foreground",
          className
        )}
        {...props}
      />
    )
  }
  return <span ref={ref} style={{ display: "none" }} {...props} />
})
NativeContextMenuShortcut.displayName = "NativeContextMenuShortcut"

const NativeContextMenuGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { useNative } = React.useContext(NativeMenuModeContext)
  if (!useNative) {
    return <RadixContextMenuGroup ref={ref as any} {...props} />
  }
  return <div ref={ref} style={{ display: "none" }} {...props} />
})
NativeContextMenuGroup.displayName = "NativeContextMenuGroup"

const NativeContextMenuPortal = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { useNative } = React.useContext(NativeMenuModeContext)
  if (!useNative) {
    return <RadixContextMenuPortal {...props} />
  }
  return <div ref={ref} style={{ display: "none" }} {...props} />
})
NativeContextMenuPortal.displayName = "NativeContextMenuPortal"

// Submenu collector hook with registration callback
const useSubmenuCollector = (onItemsChange?: () => void) => {
  const itemsRef = React.useRef<Map<string, NativeMenuItem>>(new Map())
  const clickHandlersRef = React.useRef<Map<string, () => void>>(new Map())
  const itemBatchesRef = React.useRef<
    Map<
      string,
      {
        disabled?: boolean
        disabledItemId?: string
        items: Array<{ id: string; label: string; disabled?: boolean }>
        onSelect: (id: string) => void
      }
    >
  >(new Map())
  const batchClickHandlersRef = React.useRef<
    Map<string, (itemId: string) => void>
  >(new Map())
  const orderRef = React.useRef<string[]>([])
  const labelIndexRef = React.useRef<Map<string, string>>(new Map())

  const getDedupeKey = React.useCallback((item: NativeMenuItem) => {
    if (item.type === "separator") return null
    if (item.type === "submenu") return `submenu:${item.label}`
    if ("label" in item && item.label) {
      return `${item.type}:${item.label}`
    }
    return null
  }, [])

  const removeById = React.useCallback((id: string) => {
    itemsRef.current.delete(id)
    clickHandlersRef.current.delete(id)
    itemBatchesRef.current.delete(id)
    batchClickHandlersRef.current.delete(id)
    const index = orderRef.current.indexOf(id)
    if (index > -1) {
      orderRef.current.splice(index, 1)
    }
    labelIndexRef.current.forEach((value, key) => {
      if (value === id) {
        labelIndexRef.current.delete(key)
      }
    })
  }, [])

  const upsertItem = React.useCallback(
    (id: string, item: NativeMenuItem, onClick?: () => void) => {
      removeById(id)
      const dedupeKey = getDedupeKey(item)
      if (dedupeKey) {
        const existingId = labelIndexRef.current.get(dedupeKey)
        if (existingId && existingId !== id) {
          removeById(existingId)
        }
        labelIndexRef.current.set(dedupeKey, id)
      }

      itemsRef.current.set(id, item)
      if (onClick) {
        clickHandlersRef.current.set(id, onClick)
      }
      if (!orderRef.current.includes(id)) {
        orderRef.current.push(id)
      }
    },
    [getDedupeKey, removeById]
  )

  const registerItem = React.useCallback(
    (id: string, item: NativeMenuItem, onClick?: () => void) => {
      upsertItem(id, item, onClick)
      onItemsChange?.()
    },
    [onItemsChange, upsertItem]
  )

  const registerItemBatch = React.useCallback(
    (
      id: string,
      items: Array<{ id: string; label: string; disabled?: boolean }>,
      onSelect: (id: string) => void,
      options: { disabled?: boolean; disabledItemId?: string } = {}
    ) => {
      removeById(id)
      itemBatchesRef.current.set(id, { ...options, items, onSelect })
      batchClickHandlersRef.current.set(id, (itemId) => {
        const separatorIndex = itemId.lastIndexOf(NATIVE_MENU_BATCH_SEPARATOR)
        if (separatorIndex < 0) return
        onSelect(
          decodeURIComponent(
            itemId.slice(separatorIndex + NATIVE_MENU_BATCH_SEPARATOR.length)
          )
        )
      })
      orderRef.current.push(id)
      onItemsChange?.()
    },
    [onItemsChange, removeById]
  )

  const unregisterItem = React.useCallback(
    (id: string) => {
      removeById(id)
      onItemsChange?.()
    },
    [onItemsChange, removeById]
  )

  const unregisterItemBatch = React.useCallback(
    (id: string) => {
      removeById(id)
      onItemsChange?.()
    },
    [onItemsChange, removeById]
  )

  const getItems = React.useCallback<() => NativeMenuItem[]>(() => {
    const seenIds = new Set<string>()
    const collectedItems: NativeMenuItem[] = []

    orderRef.current.forEach((id) => {
      if (seenIds.has(id)) return
      seenIds.add(id)
      const batch = itemBatchesRef.current.get(id)
      if (batch) {
        batch.items.forEach((item) => {
          collectedItems.push({
            type: "text",
            label: item.label,
            id: `${id}${NATIVE_MENU_BATCH_SEPARATOR}${encodeURIComponent(item.id)}`,
            enabled:
              !batch.disabled &&
              !item.disabled &&
              item.id !== batch.disabledItemId,
          })
        })
        return
      }
      const item = itemsRef.current.get(id)
      if (item) collectedItems.push(item)
    })
    return collectedItems
  }, [])

  const hasItems = React.useCallback(
    () =>
      orderRef.current.some(
        (id) =>
          itemsRef.current.has(id) ||
          (itemBatchesRef.current.get(id)?.items.length ?? 0) > 0
      ),
    []
  )

  const getClickHandlers = React.useCallback(() => {
    return clickHandlersRef.current
  }, [])

  const getBatchClickHandlers = React.useCallback(
    () => batchClickHandlersRef.current,
    []
  )

  return {
    registerItem,
    registerItemBatch,
    unregisterItem,
    unregisterItemBatch,
    getItems,
    hasItems,
    getClickHandlers,
    getBatchClickHandlers,
  }
}

// Context for submenu items
const NativeSubmenuContext = React.createContext<ReturnType<
  typeof useSubmenuCollector
> | null>(null)

// Context for submenu trigger info
const NativeSubmenuTriggerContext = React.createContext<{
  setTriggerInfo: (info: {
    label: string
    enabled?: boolean
    icon?: string
  }) => void
  triggerInfo: { label: string; enabled?: boolean; icon?: string } | null
} | null>(null)

const NativeContextMenuSub = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  const { useNative } = React.useContext(NativeMenuModeContext)
  const parentContext = React.useContext(NativeMenuContext)
  const triggerInfoRef = React.useRef<{
    label: string
    enabled?: boolean
    icon?: string
  } | null>(null)
  const itemId = React.useId()
  const submenuCollectorRef = React.useRef<ReturnType<
    typeof useSubmenuCollector
  > | null>(null)
  const registeredClickHandlerIdsRef = React.useRef<Set<string>>(new Set())
  const registeredBatchHandlerIdsRef = React.useRef<Set<string>>(new Set())

  const checkAndRegister = React.useCallback(() => {
    if (!useNative) return
    const submenuCollector = submenuCollectorRef.current
    if (!parentContext || !triggerInfoRef.current || !submenuCollector) return
    if (submenuCollector.hasItems()) {
      const triggerItem = {
        type: "text" as const,
        label: triggerInfoRef.current.label,
        enabled: triggerInfoRef.current.enabled ?? true,
        icon: triggerInfoRef.current.icon,
      }

      // Resolve the potentially large submenu only when the native menu opens.
      parentContext.registerSubmenu(
        itemId,
        triggerItem,
        submenuCollector.getItems
      )

      const submenuClickHandlers = submenuCollector.getClickHandlers()
      registeredClickHandlerIdsRef.current.forEach((id) => {
        if (!submenuClickHandlers.has(id)) {
          parentContext.unregisterClickHandler?.(id)
          registeredClickHandlerIdsRef.current.delete(id)
        }
      })
      submenuClickHandlers.forEach((handler, id) => {
        parentContext.registerClickHandler?.(id, handler)
        registeredClickHandlerIdsRef.current.add(id)
      })

      const batchClickHandlers = submenuCollector.getBatchClickHandlers()
      registeredBatchHandlerIdsRef.current.forEach((id) => {
        if (!batchClickHandlers.has(id)) {
          parentContext.unregisterBatchClickHandler?.(id)
          registeredBatchHandlerIdsRef.current.delete(id)
        }
      })
      batchClickHandlers.forEach((handler, id) => {
        parentContext.registerBatchClickHandler?.(id, handler)
        registeredBatchHandlerIdsRef.current.add(id)
      })
    } else {
      registeredClickHandlerIdsRef.current.forEach((id) =>
        parentContext.unregisterClickHandler?.(id)
      )
      registeredClickHandlerIdsRef.current.clear()
      registeredBatchHandlerIdsRef.current.forEach((id) =>
        parentContext.unregisterBatchClickHandler?.(id)
      )
      registeredBatchHandlerIdsRef.current.clear()
      parentContext.unregisterItem(itemId)
    }
  }, [itemId, parentContext, useNative])

  const submenuCollector = useSubmenuCollector(checkAndRegister)
  submenuCollectorRef.current = submenuCollector

  const triggerContextValue = React.useMemo(
    () => ({
      setTriggerInfo: (info: {
        label: string
        enabled?: boolean
        icon?: string
      }) => {
        triggerInfoRef.current = info
        checkAndRegister()
      },
      triggerInfo: triggerInfoRef.current,
    }),
    [checkAndRegister]
  )

  React.useEffect(() => {
    if (!useNative) return
    return () => {
      if (parentContext) {
        registeredClickHandlerIdsRef.current.forEach((id) =>
          parentContext.unregisterClickHandler?.(id)
        )
        registeredClickHandlerIdsRef.current.clear()
        registeredBatchHandlerIdsRef.current.forEach((id) =>
          parentContext.unregisterBatchClickHandler?.(id)
        )
        registeredBatchHandlerIdsRef.current.clear()
        parentContext.unregisterItem(itemId)
      }
    }
  }, [parentContext, itemId, useNative])

  if (!useNative) {
    return <RadixContextMenuSub {...props}>{children}</RadixContextMenuSub>
  }

  return (
    <NativeSubmenuTriggerContext.Provider value={triggerContextValue}>
      <NativeSubmenuContext.Provider value={submenuCollector}>
        <div ref={ref} style={{ display: "none" }} {...props}>
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
  const { useNative } = React.useContext(NativeMenuModeContext)
  const submenuContext = React.useContext(NativeSubmenuContext)
  const parentContext = React.useContext(NativeMenuContext)

  if (!useNative) {
    return (
      <RadixContextMenuSubContent ref={ref as any} {...props}>
        {children}
      </RadixContextMenuSubContent>
    )
  }

  const menuContextValue = React.useMemo(
    () => ({
      registerItem: submenuContext?.registerItem || (() => {}),
      unregisterItem: submenuContext?.unregisterItem || (() => {}),
      registerSubmenu: () => {}, // Submenus don't support nested submenus
      getMenuItems: submenuContext?.getItems || (() => []),
      clearAll: () => {}, // Submenus don't need clearAll
      registerClickHandler: parentContext?.registerClickHandler,
      unregisterClickHandler: parentContext?.unregisterClickHandler,
      registerBatchClickHandler: parentContext?.registerBatchClickHandler,
      unregisterBatchClickHandler: parentContext?.unregisterBatchClickHandler,
    }),
    [submenuContext, parentContext]
  )

  return (
    <NativeMenuContext.Provider value={menuContextValue}>
      <div ref={ref} style={{ display: "none" }} {...props}>
        {children}
      </div>
    </NativeMenuContext.Provider>
  )
})
NativeContextMenuSubContent.displayName = "NativeContextMenuSubContent"

interface NativeContextMenuSubItemsProps {
  disabled?: boolean
  disabledItemId?: string
  items: Array<{ id: string; label: string; disabled?: boolean }>
  onSelect: (id: string) => void
}

const NativeContextMenuSubItems = React.memo(
  function NativeContextMenuSubItems({
    disabled,
    disabledItemId,
    items,
    onSelect,
  }: NativeContextMenuSubItemsProps) {
    const { useNative } = React.useContext(NativeMenuModeContext)
    const submenuContext = React.useContext(NativeSubmenuContext)
    const itemBatchId = React.useId()

    React.useEffect(() => {
      if (!useNative || !submenuContext || items.length === 0) return
      submenuContext.registerItemBatch(itemBatchId, items, onSelect, {
        disabled,
        disabledItemId,
      })
      return () => {
        submenuContext.unregisterItemBatch(itemBatchId)
      }
    }, [
      disabled,
      disabledItemId,
      itemBatchId,
      items,
      onSelect,
      submenuContext,
      useNative,
    ])

    if (useNative) return null
    return items.map((item) => (
      <RadixContextMenuItem
        key={item.id}
        disabled={disabled || item.disabled || item.id === disabledItemId}
        onSelect={() => onSelect(item.id)}
      >
        {item.label}
      </RadixContextMenuItem>
    ))
  }
)
NativeContextMenuSubItems.displayName = "NativeContextMenuSubItems"

const NativeContextMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  const { useNative } = React.useContext(NativeMenuModeContext)
  const triggerContext = React.useContext(NativeSubmenuTriggerContext)

  // Extract text content for submenu trigger
  const getTextContent = (children: React.ReactNode): string => {
    if (typeof children === "string") return children
    if (React.isValidElement(children)) {
      return getTextContent(children.props.children)
    }
    if (Array.isArray(children)) {
      return children.map(getTextContent).join("")
    }
    return ""
  }

  const label = getTextContent(children)

  // Set trigger info
  React.useEffect(() => {
    if (useNative && triggerContext && label) {
      triggerContext.setTriggerInfo({
        label,
        enabled: true,
      })
    }
  }, [triggerContext, label, useNative])

  if (!useNative) {
    return (
      <RadixContextMenuSubTrigger ref={ref as any} {...props}>
        {children}
      </RadixContextMenuSubTrigger>
    )
  }

  return <div ref={ref} style={{ display: "none" }} {...props} />
})
NativeContextMenuSubTrigger.displayName = "NativeContextMenuSubTrigger"

const NativeContextMenuRadioGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { useNative } = React.useContext(NativeMenuModeContext)
  if (!useNative) {
    return <RadixContextMenuRadioGroup ref={ref as any} {...props} />
  }
  return <div ref={ref} style={{ display: "none" }} {...props} />
})
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
  NativeContextMenuSubItems,
  NativeContextMenuSubTrigger,
  NativeContextMenuRadioGroup,
}
