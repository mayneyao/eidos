"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileIcon, FolderIcon } from "lucide-react"
import { FinderDialog } from "./FinderDialog"

/**
 * 示例：文件选择器按钮
 */
export function FilePickerExample() {
  const [open, setOpen] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const handleSelect = (paths: string[]) => {
    setSelectedPath(paths[0])
    console.log("Selected file:", paths[0])
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={() => setOpen(true)} variant="outline">
          <FileIcon className="h-4 w-4 mr-2" />
          选择文件
        </Button>

        {selectedPath && (
          <span className="text-sm text-muted-foreground">
            已选择: {selectedPath}
          </span>
        )}
      </div>

      <FinderDialog
        open={open}
        onOpenChange={setOpen}
        title="选择文件"
        confirmLabel="选择"
        onSelect={handleSelect}
        selectMode="file"
        allowMultiple={false}
        initialPath="~/"
      />
    </div>
  )
}

/**
 * 示例：文件夹选择器按钮
 */
export function FolderPickerExample() {
  const [open, setOpen] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const handleSelect = (paths: string[]) => {
    setSelectedPath(paths[0])
    console.log("Selected folder:", paths[0])
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={() => setOpen(true)} variant="outline">
          <FolderIcon className="h-4 w-4 mr-2" />
          选择文件夹
        </Button>

        {selectedPath && (
          <span className="text-sm text-muted-foreground">
            已选择: {selectedPath}
          </span>
        )}
      </div>

      <FinderDialog
        open={open}
        onOpenChange={setOpen}
        title="选择文件夹"
        confirmLabel="选择此文件夹"
        onSelect={handleSelect}
        selectMode="directory"
        initialPath="~/"
      />
    </div>
  )
}

/**
 * 示例：多文件选择
 */
export function MultiFilePickerExample() {
  const [open, setOpen] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])

  const handleSelect = (paths: string[]) => {
    setSelectedPaths(paths)
    console.log("Selected files:", paths)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={() => setOpen(true)} variant="outline">
          <FileIcon className="h-4 w-4 mr-2" />
          选择多个文件
        </Button>

        {selectedPaths.length > 0 && (
          <span className="text-sm text-muted-foreground">
            已选择 {selectedPaths.length} 个文件
          </span>
        )}
      </div>

      <FinderDialog
        open={open}
        onOpenChange={setOpen}
        title="选择多个文件"
        confirmLabel="选择"
        onSelect={handleSelect}
        selectMode="file"
        allowMultiple={true}
        initialPath="~/"
      />
    </div>
  )
}
