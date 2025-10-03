import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { Plus } from "lucide-react"

import { useCurrentNode } from "@/hooks/use-current-node"

import { AddPropertyInput } from "./add-property-input"
import { useDocProperty } from "./hook"
import { useDocPropertyTypes } from "./property-type-hook"
import { PropertyDropdown } from "./property-dropdown"
import { PropertyItem } from "./property-item"
import type { DocPropertyGlobalProps } from "./types"
import { isSystemProperty } from "./utils"

export const DocPropertyGlobal: React.FC<DocPropertyGlobalProps> = ({
  docId,
  parentNode,
}) => {
  const {
    properties: availableProperties,
    setProperty,
    addDisplayProperty,
    removeDisplayProperty,
    setDisplayProperties,
    displayProperties,
  } = useDocProperty({ docId })
  const { propertyTypes } = useDocPropertyTypes()
  const currentNode = useCurrentNode()
  const isLocked = Boolean(currentNode?.is_locked)

  const [showAddInput, setShowAddInput] = useState(false)
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false)
  const [autoEditProperty, setAutoEditProperty] = useState<string | null>(null)
  const [newPropertyInitialValue, setNewPropertyInitialValue] = useState<string | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  // Optimistic update state for drag sorting
  const [optimisticDisplayProperties, setOptimisticDisplayProperties] =
    useState<string[] | null>(null)

  // Get existing property names for validation
  const existingPropertyNames = useMemo(() => {
    return propertyTypes.map(prop => prop.name)
  }, [propertyTypes])

  // Use optimistic state or original state
  const currentDisplayProperties =
    optimisticDisplayProperties || displayProperties

  // Clear optimistic state when real state updates
  useEffect(() => {
    if (optimisticDisplayProperties && displayProperties) {
      // Check if real state has been updated to our expected state
      const isSynced =
        JSON.stringify(optimisticDisplayProperties) ===
        JSON.stringify(displayProperties)
      if (isSynced) {
        setOptimisticDisplayProperties(null)
      }
    }
  }, [displayProperties, optimisticDisplayProperties])

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (showAddInput || showPropertyDropdown) return

      const container = containerRef.current
      if (!container) return

      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return

      if (!container.contains(document.activeElement)) return

      const currentFocused = document.activeElement as HTMLElement

      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const currentIndex = Array.from(propertyItems).indexOf(currentFocused)

      if (propertyItems.length === 0) {
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          if (currentIndex < propertyItems.length - 1) {
            propertyItems[currentIndex + 1].focus()
          } else {
            container.blur()
            window.dispatchEvent(new CustomEvent("eidos-editor-focus"))
          }
          break
        case "ArrowUp":
          e.preventDefault()
          if (currentIndex > 0) {
            propertyItems[currentIndex - 1].focus()
          } else if (currentIndex === 0) {
            propertyItems[0].focus()
          }
          break
        case "Enter":
          e.preventDefault()
          if (currentIndex >= 0 && !isLocked) {
            const currentElement = propertyItems[currentIndex]
            const propertyName =
              currentElement.getAttribute("data-property-name")
            if (propertyName === "__add_property__") {
              setShowPropertyDropdown(true)
            } else if (
              propertyName &&
              currentIndex < currentDisplayProperties.length
            ) {
              const actualPropertyName = currentDisplayProperties[currentIndex]
              console.log("actualPropertyName", actualPropertyName)
              setAutoEditProperty(actualPropertyName)
              setTimeout(() => setAutoEditProperty(null), 100)
            }
          }
          break
        case "Escape":
          e.preventDefault()
          container.blur()
          break
      }
    },
    [currentDisplayProperties, showAddInput, showPropertyDropdown, isLocked]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  useEffect(() => {
    const handlePropertyActivate = () => {
      const container = containerRef.current
      if (!container) return

      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const lastItem = propertyItems[propertyItems.length - 1]
      if (lastItem) {
        lastItem.focus()
      } else {
        container.focus()
      }
    }

    window.addEventListener("eidos-property-activate", handlePropertyActivate)
    return () => {
      window.removeEventListener(
        "eidos-property-activate",
        handlePropertyActivate
      )
    }
  }, [currentDisplayProperties.length])

  const systemProperties = useMemo(() => {
    if (!availableProperties) return []

    return Object.entries(availableProperties).filter(([key, value]) => {
      const isSystemProp = isSystemProperty(key)
      const isDisplayed = currentDisplayProperties.includes(key)

      return isSystemProp && !isDisplayed
    })
  }, [availableProperties, currentDisplayProperties])

  const selectableProperties = useMemo(() => {
    if (!availableProperties) return []

    const result = Object.entries(availableProperties).filter(
      ([key, value]) => {
        const isDisplayed = currentDisplayProperties.includes(key)
        const isSystemProp = isSystemProperty(key)
        return !isSystemProp && !isDisplayed
      }
    )

    return result
  }, [availableProperties, currentDisplayProperties])

  const handlePropertyUpdate = async (propertyName: string, value: any) => {
    console.log("handlePropertyUpdate", propertyName, value)
    try {
      await setProperty({ [propertyName]: value })
    } catch (error) {
      console.error("Failed to update property:", error)
    }
  }

  const handleAddProperty = async (propertyName: string) => {
    try {
      const initialValue = ""
      await setProperty({ [propertyName]: initialValue })
      await addDisplayProperty(docId, propertyName)
      setShowAddInput(false)
      setNewPropertyInitialValue(undefined)
    } catch (error) {
      console.error("Failed to add property:", error)
    }
  }

  const handleSelectExistingProperty = async (propertyName: string) => {
    try {
      await addDisplayProperty(docId, propertyName)
      setShowPropertyDropdown(false)
      if (!isSystemProperty(propertyName)) {
        setAutoEditProperty(propertyName)
        setTimeout(() => setAutoEditProperty(null), 100)
      }
    } catch (error) {
      console.error("Failed to add existing property:", error)
    }
  }

  const handleDeleteProperty = async (propertyName: string) => {
    try {
      await removeDisplayProperty(docId, propertyName)
      // const isSystem = isSystemProperty(propertyName)

      // if (isSystem) {
      //   await removeDisplayProperty(docId, propertyName)
      // } else {
      //   await setProperty({ [propertyName]: null })
      //   await removeDisplayProperty(docId, propertyName)
      // }
    } catch (error) {
      console.error("Failed to delete property:", error)
    }
  }

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (over && active.id !== over.id) {
        const oldIndex = currentDisplayProperties.findIndex(
          (name: string) => name === active.id
        )
        const newIndex = currentDisplayProperties.findIndex(
          (name: string) => name === over.id
        )

        if (oldIndex !== -1 && newIndex !== -1) {
          const newProperties = arrayMove(
            currentDisplayProperties,
            oldIndex,
            newIndex
          ) as string[]

          // Immediately update optimistic state
          setOptimisticDisplayProperties(newProperties)

          try {
            await setDisplayProperties(docId, newProperties)
            console.log("setDisplayProperties success")
            // Clear optimistic state after success, let real state take over
            setOptimisticDisplayProperties(null)
          } catch (error) {
            console.error("Failed to update property order:", error)
            // Rollback to original state on failure
            setOptimisticDisplayProperties(null)
          }
        }
      }
    },
    [currentDisplayProperties, setDisplayProperties, docId]
  )

  const handleEditEnd = useCallback((propertyName: string) => {
    setTimeout(() => {
      const container = containerRef.current
      if (container) {
        const propertyItem = container.querySelector(
          `[data-property-name="${propertyName}"]`
        ) as HTMLElement
        if (propertyItem) {
          propertyItem.focus()
        }
      }
    }, 0)
  }, [])

  return (
    <div ref={containerRef} className="focus:outline-none" tabIndex={0}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={currentDisplayProperties}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {currentDisplayProperties.map((propertyName: string) => (
              <PropertyItem
                key={propertyName}
                propertyName={propertyName}
                value={availableProperties?.[propertyName]}
                onUpdate={handlePropertyUpdate}
                onDelete={handleDeleteProperty}
                autoEdit={autoEditProperty === propertyName}
                onEditEnd={() => handleEditEnd(propertyName)}
                readonly={isLocked}
                isSystemProperty={isSystemProperty(propertyName)}
                isDragDisabled={isLocked}
                allowTypeChange={!isSystemProperty(propertyName) && !isLocked}
              />
            ))}
          </div>
        </SortableContext>

        {!isLocked && (
          <>
            {showAddInput ? (
              <AddPropertyInput
                onAdd={handleAddProperty}
                onCancel={() => {
                  setShowAddInput(false)
                  setNewPropertyInitialValue(undefined)
                }}
                initialValue={newPropertyInitialValue}
                existingProperties={existingPropertyNames}
              />
            ) : (
              <div className="flex items-center py-1">
                <div className="flex items-center gap-2 w-40 flex-shrink-0 relative">
                  <button
                    onClick={() => setShowPropertyDropdown(true)}
                    className="group flex items-center gap-2 h-6 py-1 px-2 -mx-2 rounded border transition-colors cursor-pointer border-transparent hover:border-border hover:bg-muted/50 focus:border-border focus:bg-muted/50 focus:outline-none"
                    tabIndex={0}
                    data-property-item
                    data-property-name="__add_property__"
                  >
                    <span className="text-muted-foreground group-hover:text-foreground group-focus:text-foreground">
                      <Plus className="w-3 h-3" />
                    </span>
                    <span className="text-sm text-muted-foreground group-hover:text-foreground group-focus:text-foreground">
                      Add Property
                    </span>
                  </button>

                  {/* Property selection dropdown */}
                  {showPropertyDropdown && (
                    <PropertyDropdown
                      availableProperties={Object.fromEntries(
                        selectableProperties
                      )}
                      systemProperties={Object.fromEntries(systemProperties)}
                      onSelectProperty={handleSelectExistingProperty}
                      onCreateNew={(searchQuery) => {
                        setShowPropertyDropdown(false)
                        setNewPropertyInitialValue(searchQuery)
                        setShowAddInput(true)
                      }}
                      onClose={() => setShowPropertyDropdown(false)}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DndContext>
    </div>
  )
}

export default DocPropertyGlobal
