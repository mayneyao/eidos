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
import { useDocPropertyGlobal, useDocPropertyMeta } from "./hook"
import { PropertyDropdown } from "./property-dropdown"
import { PropertyItem } from "./property-item"
import type { DocPropertyGlobalProps } from "./types"
import { isSystemProperty } from "./utils"

export const DocPropertyGlobal: React.FC<DocPropertyGlobalProps> = ({
  docId,
  parentNode,
}) => {
  const { getAllProperties, setProperty } = useDocPropertyGlobal()
  const {
    getDisplayProperties,
    addDisplayProperty,
    removeDisplayProperty,
    setDisplayProperties,
  } = useDocPropertyMeta()
  const currentNode = useCurrentNode()
  const isLocked = Boolean(currentNode?.is_locked)

  const [displayedProperties, setDisplayedProperties] = useState<
    Record<string, any>
  >({})
  const [availableProperties, setAvailableProperties] = useState<
    Record<string, any>
  >({})
  const [showAddInput, setShowAddInput] = useState(false)
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false)
  const [autoEditProperty, setAutoEditProperty] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const fetchProperties = async () => {
      const [displayProps, allProps] = await Promise.all([
        getDisplayProperties(docId),
        getAllProperties(docId),
      ])
      if (displayProps) {
        setDisplayedProperties(displayProps)
      }
      if (allProps) {
        setAvailableProperties(allProps)
      }
    }
    fetchProperties()
  }, [docId, getDisplayProperties, getAllProperties])

  const customProperties = useMemo(() => {
    return Object.entries(displayedProperties)
  }, [displayedProperties])

  // 键盘导航处理
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 如果正在显示输入框或下拉框，不处理键盘导航
      if (showAddInput || showPropertyDropdown) return

      const container = containerRef.current
      if (!container) return

      // 只处理特定的键盘事件，让 Tab 键使用浏览器原生行为
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return

      // 检查焦点是否在属性面板内
      if (!container.contains(document.activeElement)) return

      const currentFocused = document.activeElement as HTMLElement

      // 获取所有可聚焦的属性项（包括 Add Property 按钮）
      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const currentIndex = Array.from(propertyItems).indexOf(currentFocused)

      // 如果没有找到任何可聚焦的元素，直接返回
      if (propertyItems.length === 0) {
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          if (currentIndex < propertyItems.length - 1) {
            propertyItems[currentIndex + 1].focus()
          } else {
            // 已经在最后一个可聚焦元素，跳转到编辑器
            container.blur()
            window.dispatchEvent(new CustomEvent("eidos-editor-focus"))
          }
          break
        case "ArrowUp":
          e.preventDefault()
          if (currentIndex > 0) {
            propertyItems[currentIndex - 1].focus()
          } else if (currentIndex === 0) {
            // 已经在第一个，保持焦点
            propertyItems[0].focus()
          }
          break
        case "Enter":
          e.preventDefault()
          if (currentIndex >= 0 && !isLocked) {
            // 检查是否是 Add Property 按钮
            const currentElement = propertyItems[currentIndex]
            const propertyName =
              currentElement.getAttribute("data-property-name")

            if (propertyName === "__add_property__") {
              // 触发 Add Property 下拉框
              setShowPropertyDropdown(true)
            } else if (propertyName && currentIndex < customProperties.length) {
              // 编辑普通属性（确保索引在范围内且有有效的属性名）
              const [actualPropertyName] = customProperties[currentIndex]
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
    [customProperties, showAddInput, showPropertyDropdown, isLocked]
  )

  // 添加键盘事件监听
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  // 添加属性激活事件监听
  useEffect(() => {
    const handlePropertyActivate = () => {
      const container = containerRef.current
      if (!container) return

      // 聚焦到最后一个可聚焦元素（属性项或 Add Property 按钮）
      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const lastItem = propertyItems[propertyItems.length - 1]
      if (lastItem) {
        lastItem.focus()
      } else {
        // 如果没有任何可聚焦元素，聚焦到容器
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
  }, [customProperties.length])

  const systemProperties = useMemo(() => {
    const displayedKeys = Object.keys(displayedProperties)

    return Object.entries(availableProperties).filter(([key, value]) => {
      const isSystemProp = isSystemProperty(key)
      const isDisplayed = displayedKeys.includes(key)

      return isSystemProp && !isDisplayed
    })
  }, [displayedProperties, availableProperties])

  const selectableProperties = useMemo(() => {
    const displayedKeys = Object.keys(displayedProperties)

    const result = Object.entries(availableProperties).filter(
      ([key, value]) => {
        const isSystemProp = isSystemProperty(key)
        const isDisplayed = displayedKeys.includes(key)

        return !isSystemProp && !isDisplayed
      }
    )

    return result
  }, [displayedProperties, availableProperties])

  const handlePropertyUpdate = async (propertyName: string, value: any) => {
    try {
      await setProperty(docId, { [propertyName]: value })
      setDisplayedProperties((prev) => ({ ...prev, [propertyName]: value }))
    } catch (error) {
      console.error("Failed to update property:", error)
    }
  }

  const handleAddProperty = async (propertyName: string) => {
    try {
      const initialValue = ""
      const res = await setProperty(docId, { [propertyName]: initialValue })
      if (res?.success) {
        await addDisplayProperty(docId, propertyName)
        setDisplayedProperties((prev) => ({
          ...prev,
          [propertyName]: initialValue,
        }))
      }
      setShowAddInput(false)
    } catch (error) {
      console.error("Failed to add property:", error)
    }
  }

  // 选择已存在的属性
  const handleSelectExistingProperty = async (propertyName: string) => {
    try {
      const value = availableProperties[propertyName]
      await addDisplayProperty(docId, propertyName)
      setDisplayedProperties((prev) => ({ ...prev, [propertyName]: value }))
      setShowPropertyDropdown(false)

      // 只有非系统属性才设置自动编辑状态
      if (!isSystemProperty(propertyName)) {
        setAutoEditProperty(propertyName)
        // 清除自动编辑状态，确保下次可以正常工作
        setTimeout(() => setAutoEditProperty(null), 100)
      }
    } catch (error) {
      console.error("Failed to add existing property:", error)
    }
  }

  // 删除属性（系统字段只从显示中移除，自定义字段清空值并从显示配置中移除）
  const handleDeleteProperty = async (propertyName: string) => {
    try {
      const isSystem = isSystemProperty(propertyName)

      if (isSystem) {
        // 系统属性：只从显示配置中移除，保留值
        await removeDisplayProperty(docId, propertyName)
      } else {
        // 自定义属性：清空值并从显示配置中移除
        await setProperty(docId, { [propertyName]: null })
        await removeDisplayProperty(docId, propertyName)
      }

      // 更新本地状态
      setDisplayedProperties((prev) => {
        const newProps = { ...prev }
        delete newProps[propertyName]
        return newProps
      })
    } catch (error) {
      console.error("Failed to delete property:", error)
    }
  }

  // 拖拽结束处理
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (over && active.id !== over.id) {
        const oldIndex = customProperties.findIndex(
          ([name]) => name === active.id
        )
        const newIndex = customProperties.findIndex(
          ([name]) => name === over.id
        )

        if (oldIndex !== -1 && newIndex !== -1) {
          const newProperties = arrayMove(customProperties, oldIndex, newIndex)

          // 更新本地状态
          const reorderedProperties = Object.fromEntries(newProperties)
          setDisplayedProperties(reorderedProperties)

          try {
            // 更新数据库中的显示顺序
            const propertyNames = newProperties.map(([name]) => name)
            console.log("propertyNames", propertyNames)
            await setDisplayProperties(docId, propertyNames)
            console.log("setDisplayProperties success")
          } catch (error) {
            console.error("Failed to update property order:", error)
            // 如果更新失败，恢复原来的顺序
            const originalProperties = Object.fromEntries(customProperties)
            setDisplayedProperties(originalProperties)
          }
        }
      }
    },
    [customProperties, docId, setDisplayProperties]
  )

  // 编辑结束后重新聚焦到对应的属性项
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
          items={customProperties.map(([name]) => name)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {customProperties.map(([propertyName, value]) => (
              <PropertyItem
                key={propertyName}
                propertyName={propertyName}
                value={value}
                onUpdate={handlePropertyUpdate}
                onDelete={handleDeleteProperty}
                autoEdit={autoEditProperty === propertyName}
                onEditEnd={() => handleEditEnd(propertyName)}
                readonly={isLocked}
                isSystemProperty={isSystemProperty(propertyName)}
                isDragDisabled={isLocked}
              />
            ))}
          </div>
        </SortableContext>

        {!isLocked && (
          <>
            {showAddInput ? (
              <AddPropertyInput
                onAdd={handleAddProperty}
                onCancel={() => setShowAddInput(false)}
              />
            ) : (
              <div className="flex items-center py-1">
                <div className="flex items-center gap-2 w-40 flex-shrink-0 relative">
                  <button
                    onClick={() => setShowPropertyDropdown(true)}
                    className="group flex items-center gap-2 py-1 px-2 -mx-2 rounded border transition-colors cursor-pointer border-transparent hover:border-border hover:bg-muted/50 focus:border-border focus:bg-muted/50 focus:outline-none"
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

                  {/* 属性选择下拉框 */}
                  {showPropertyDropdown && (
                    <PropertyDropdown
                      availableProperties={Object.fromEntries(
                        selectableProperties
                      )}
                      systemProperties={Object.fromEntries(systemProperties)}
                      onSelectProperty={handleSelectExistingProperty}
                      onCreateNew={() => {
                        setShowPropertyDropdown(false)
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
