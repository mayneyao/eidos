/**
 * Native Context Menu Component Example
 *
 * This component provides a native context menu for desktop Electron applications.
 * It has the same API as shadcn's context-menu but uses Electron's native menu system.
 */

import React, { useState } from "react"
import {
  NativeContextMenu,
  NativeContextMenuTrigger,
  NativeContextMenuContent,
  NativeContextMenuItem,
  NativeContextMenuCheckboxItem,
  NativeContextMenuSeparator,
} from "./native-context-menu"

// Basic usage
function BasicExample() {
  return (
    <NativeContextMenu>
      <NativeContextMenuTrigger className="p-4 border border-border rounded cursor-context-menu">
        Right-click here
      </NativeContextMenuTrigger>

      <NativeContextMenuContent>
        <NativeContextMenuItem onSelect={() => console.log("Item 1 clicked")}>
          Menu Item 1
        </NativeContextMenuItem>

        <NativeContextMenuItem onSelect={() => console.log("Item 2 clicked")}>
          Menu Item 2
        </NativeContextMenuItem>

        <NativeContextMenuSeparator />

        <NativeContextMenuItem disabled onSelect={() => {}}>
          Disabled Item
        </NativeContextMenuItem>
      </NativeContextMenuContent>
    </NativeContextMenu>
  )
}

// With checkbox items
function CheckboxExample() {
  const [isChecked, setIsChecked] = useState(false)

  return (
    <NativeContextMenu>
      <NativeContextMenuTrigger className="p-4 border border-border rounded cursor-context-menu">
        Right-click here
      </NativeContextMenuTrigger>

      <NativeContextMenuContent>
        <NativeContextMenuCheckboxItem
          checked={isChecked}
          onCheckedChange={setIsChecked}
        >
          Toggle Option
        </NativeContextMenuCheckboxItem>

        <NativeContextMenuItem onSelect={() => console.log("Other action")}>
          Other Action
        </NativeContextMenuItem>
      </NativeContextMenuContent>
    </NativeContextMenu>
  )
}

// With multiple options
function MultiOptionExample() {
  const [option1, setOption1] = useState(false)
  const [option2, setOption2] = useState(true)

  return (
    <NativeContextMenu>
      <NativeContextMenuTrigger className="p-4 border border-border rounded cursor-context-menu">
        Right-click here
      </NativeContextMenuTrigger>

      <NativeContextMenuContent>
        <NativeContextMenuCheckboxItem
          checked={option1}
          onCheckedChange={setOption1}
        >
          Option 1
        </NativeContextMenuCheckboxItem>

        <NativeContextMenuCheckboxItem
          checked={option2}
          onCheckedChange={setOption2}
        >
          Option 2
        </NativeContextMenuCheckboxItem>
      </NativeContextMenuContent>
    </NativeContextMenu>
  )
}

// Complete example with all features
function CompleteExample() {
  const [showToolbar, setShowToolbar] = useState(true)
  const [showGrid, setShowGrid] = useState(false)

  return (
    <NativeContextMenu>
      <NativeContextMenuTrigger className="p-4 border border-border rounded cursor-context-menu">
        Right-click here for full menu
      </NativeContextMenuTrigger>

      <NativeContextMenuContent>
        <NativeContextMenuItem onSelect={() => console.log("New File")}>
          New File
        </NativeContextMenuItem>

        <NativeContextMenuItem onSelect={() => console.log("Open File")}>
          Open File
        </NativeContextMenuItem>

        <NativeContextMenuSeparator />

        <NativeContextMenuCheckboxItem
          checked={showToolbar}
          onCheckedChange={setShowToolbar}
        >
          Show Toolbar
        </NativeContextMenuCheckboxItem>

        <NativeContextMenuCheckboxItem
          checked={showGrid}
          onCheckedChange={setShowGrid}
        >
          Show Grid
        </NativeContextMenuCheckboxItem>

        <NativeContextMenuSeparator />

        <NativeContextMenuItem onSelect={() => console.log("Settings")}>
          Settings
        </NativeContextMenuItem>

        <NativeContextMenuItem disabled onSelect={() => {}}>
          Disabled Action
        </NativeContextMenuItem>
      </NativeContextMenuContent>
    </NativeContextMenu>
  )
}

export { BasicExample, CheckboxExample, MultiOptionExample, CompleteExample }
