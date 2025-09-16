import { useEffect, useRef, useState } from "react"
import { FieldType } from "@/packages/core/fields/const"
import { ChevronRight, Copy, EyeOff, RefreshCw, Trash2 } from "lucide-react"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"

import { PropertyIcon } from "./property-icon"
import { useDocPropertyTypes } from "./property-type-hook"
import type { PropertyType } from "./types"
import { convertFieldTypeToPropertyType } from "./utils"

interface PropertyMenuProps {
  propertyName: string
  value: any
  isSystemProperty: boolean
  readonly: boolean
  allowTypeChange: boolean
  onClose: () => void
  onDelete: (propertyName: string) => Promise<void>
}

export const PropertyMenu: React.FC<PropertyMenuProps> = ({
  propertyName,
  value,
  isSystemProperty,
  readonly,
  allowTypeChange,
  onClose,
  onDelete,
}) => {
  const [showTypeSubmenu, setShowTypeSubmenu] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [nonEmptyCount, setNonEmptyCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const mainMenuRef = useRef<HTMLDivElement>(null)
  const typeSubmenuRef = useRef<HTMLDivElement>(null)

  const { getPropertyType, changePropertyType, deleteProperty } =
    useDocPropertyTypes()
  const actualFieldType = getPropertyType(propertyName)
  const { toast } = useToast()
  const { sqlite } = useSqlite()

  // Get count of documents with non-empty values for this property
  const getNonEmptyCount = async () => {
    if (!sqlite) return

    setLoadingCount(true)
    try {
      const count = await sqlite.doc.getPropertyNonEmptyCount(propertyName)
      setNonEmptyCount(count)
    } catch (error) {
      console.error('Failed to get non-empty count:', error)
      setNonEmptyCount(0)
    } finally {
      setLoadingCount(false)
    }
  }

  // Handle showing delete confirmation dialog
  const handleShowDeleteDialog = async () => {
    await getNonEmptyCount()
    setShowDeleteDialog(true)
  }

  // Handle type change
  const handleTypeChange = async (newFieldType: FieldType) => {
    if (!allowTypeChange || isSystemProperty || readonly) return

    try {
      const result = await changePropertyType(propertyName, newFieldType)
      if (!result.success) {
        console.error(`Failed to change property type: ${result.message}`)
      }
      onClose()
    } catch (error) {
      console.error("Failed to change property type:", error)
    }
  }

  // Handle copy key
  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(propertyName)
      onClose()
    } catch (error) {
      console.error("Failed to copy key:", error)
    }
  }

  // Handle copy value
  const handleCopyValue = async () => {
    try {
      await navigator.clipboard.writeText(String(value || ""))
      onClose()
    } catch (error) {
      console.error("Failed to copy value:", error)
    }
  }

  // Handle hide/delete property
  const handleHideProperty = async () => {
    try {
      await onDelete(propertyName)
      onClose()
    } catch (error) {
      console.error("Failed to hide property:", error)
    }
  }

  // Handle delete property permanently
  const handleDeleteProperty = async () => {
    if (!deleteProperty) return

    try {
      await deleteProperty(propertyName)
      onClose()
    } catch (error) {
      console.error("Failed to delete property:", error)
      toast({
        title: "删除失败",
        description: "删除属性时发生错误，请重试",
        variant: "destructive",
      })
    }
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const isInsideMain =
        mainMenuRef.current && mainMenuRef.current.contains(target)
      const isInsideSubmenu =
        typeSubmenuRef.current && typeSubmenuRef.current.contains(target)

      // Check if click is inside any AlertDialog (they are rendered in portals)
      const isInsideAlertDialog =
        target instanceof Element &&
        (target.closest('[role="dialog"]') ||
          target.closest("[data-radix-popper-content-wrapper]") ||
          target.closest('[data-state="open"]'))

      if (!isInsideMain && !isInsideSubmenu && !isInsideAlertDialog) {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  return (
    <>
      {/* Main Menu */}
      <div
        ref={mainMenuRef}
        className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]"
      >
        {/* Change Type */}
        {allowTypeChange && !isSystemProperty && !readonly && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowTypeSubmenu(!showTypeSubmenu)
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3 h-3" />
                <span>Change Type</span>
              </div>
              <ChevronRight className="w-3 h-3" />
            </button>

            {/* Type Submenu - positioned relative to Change Type button */}
            {showTypeSubmenu && (
              <div
                ref={typeSubmenuRef}
                className="absolute left-full top-0 ml-1 z-[51] bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]"
              >
                {/* Basic Types Only */}
                {[
                  FieldType.Text,
                  FieldType.Number,
                  FieldType.Date,
                  FieldType.DateTime,
                  FieldType.Checkbox,
                  // FieldType.MultiSelect,
                ].map((fieldType) => (
                  <button
                    key={fieldType}
                    onClick={() => handleTypeChange(fieldType)}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 ${
                      actualFieldType === fieldType
                        ? "bg-accent text-accent-foreground"
                        : ""
                    }`}
                  >
                    <PropertyIcon
                      type={
                        convertFieldTypeToPropertyType(
                          fieldType
                        ) as PropertyType
                      }
                    />
                    <span className="capitalize">
                      {fieldType.replace("-", " ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Copy Key */}
        <button
          onClick={handleCopyKey}
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
        >
          <Copy className="w-3 h-3" />
          <span>Copy Key</span>
        </button>

        {/* Copy Value */}
        <button
          onClick={handleCopyValue}
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
        >
          <Copy className="w-3 h-3" />
          <span>Copy Value</span>
        </button>

        {/* Hide */}
        {!readonly && (
          <button
            onClick={handleHideProperty}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          >
            <EyeOff className="w-3 h-3" />
            <span>Hide</span>
          </button>
        )}

        {/* Delete Property */}
        {!readonly && !isSystemProperty && (
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogTrigger asChild>
                 <button
                   onClick={(e) => {
                     e.stopPropagation() // 阻止事件冒泡，防止触发外部点击检测
                     handleShowDeleteDialog()
                   }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete Property</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除属性</AlertDialogTitle>
                  <AlertDialogDescription>
                    你确定要删除属性 "{propertyName}" 吗？
                    <br />
                    {loadingCount ? (
                      <span className="text-sm text-muted-foreground">正在检查影响范围...</span>
                    ) : nonEmptyCount !== null ? (
                      <span className="text-sm">
                        <strong className="text-orange-600">
                          将影响 {nonEmptyCount} 个文档（包含该属性的文档数量）。
                        </strong>
                      </span>
                    ) : null}
                    <br />
                    <strong className="text-red-600">
                      此操作将从所有文档中永久删除该属性，且无法撤销。
                    </strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                   <AlertDialogAction
                     onClick={handleDeleteProperty}
                     disabled={loadingCount}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    删除属性
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
      </div>
    </>
  )
}
