# Native Context Menu

A React component that provides native context menus for Electron desktop applications. This component has the same API as shadcn's context-menu but uses Electron's native menu system for better performance and native look & feel.

## Features

- **Native Menus**: Uses Electron's native menu system instead of web-based menus
- **Same API**: Drop-in replacement for shadcn's context-menu component
- **Desktop Only**: Optimized for desktop Electron applications
- **Type Safe**: Full TypeScript support

## Installation

The component is already included in the desktop application. No additional installation required.

## Basic Usage

```tsx
import {
  NativeContextMenu,
  NativeContextMenuTrigger,
  NativeContextMenuContent,
  NativeContextMenuItem,
  NativeContextMenuSeparator,
} from '@/components/ui/native-context-menu'

function MyComponent() {
  return (
    <NativeContextMenu>
      <NativeContextMenuTrigger className="p-4 border rounded cursor-context-menu">
        Right-click here
      </NativeContextMenuTrigger>

      <NativeContextMenuContent>
        <NativeContextMenuItem onSelect={() => console.log('Item clicked')}>
          Menu Item
        </NativeContextMenuItem>

        <NativeContextMenuSeparator />

        <NativeContextMenuItem onSelect={() => console.log('Another item')}>
          Another Item
        </NativeContextMenuItem>
      </NativeContextMenuContent>
    </NativeContextMenu>
  )
}
```

## Components

### NativeContextMenu

The root component that provides the context menu functionality.

```tsx
<NativeContextMenu onOpenChange={(open) => console.log('Menu opened:', open)}>
  {/* children */}
</NativeContextMenu>
```

### NativeContextMenuTrigger

The element that triggers the context menu when right-clicked.

```tsx
<NativeContextMenuTrigger className="your-classes">
  Right-click me
</NativeContextMenuTrigger>
```

### NativeContextMenuContent

Contains the menu items. This component doesn't render anything visually - it just collects the menu items.

```tsx
<NativeContextMenuContent>
  {/* menu items */}
</NativeContextMenuContent>
```

### NativeContextMenuItem

A basic menu item.

```tsx
<NativeContextMenuItem
  onSelect={() => handleAction()}
  disabled={false}
>
  Menu Item Text
</NativeContextMenuItem>
```

### NativeContextMenuCheckboxItem

A checkbox menu item.

```tsx
<NativeContextMenuCheckboxItem
  checked={isChecked}
  onCheckedChange={setIsChecked}
>
  Toggle Option
</NativeContextMenuCheckboxItem>
```

### NativeContextMenuRadioItem

A radio button menu item (must be used within NativeContextMenuRadioGroup).

```tsx
<NativeContextMenuRadioItem value="option1">
  Option 1
</NativeContextMenuRadioItem>
```

### NativeContextMenuSeparator

A separator line between menu items.

```tsx
<NativeContextMenuSeparator />
```

## Advanced Usage

### With State Management

```tsx
import { useState } from 'react'

function MyComponent() {
  const [isVisible, setIsVisible] = useState(true)
  const [theme, setTheme] = useState('light')

  return (
    <NativeContextMenu>
      <NativeContextMenuTrigger>
        Right-click for options
      </NativeContextMenuTrigger>

      <NativeContextMenuContent>
        <NativeContextMenuCheckboxItem
          checked={isVisible}
          onCheckedChange={setIsVisible}
        >
          Show Component
        </NativeContextMenuCheckboxItem>

        <NativeContextMenuSeparator />

        <NativeContextMenuRadioGroup value={theme} onValueChange={setTheme}>
          <NativeContextMenuRadioItem value="light">Light</NativeContextMenuRadioItem>
          <NativeContextMenuRadioItem value="dark">Dark</NativeContextMenuRadioItem>
        </NativeContextMenuRadioGroup>
      </NativeContextMenuContent>
    </NativeContextMenu>
  )
}
```

## API Compatibility

This component is designed to be a drop-in replacement for shadcn's context-menu. All the same props and components are supported:

- ✅ `ContextMenu` → `NativeContextMenu`
- ✅ `ContextMenuTrigger` → `NativeContextMenuTrigger`
- ✅ `ContextMenuContent` → `NativeContextMenuContent`
- ✅ `ContextMenuItem` → `NativeContextMenuItem`
- ✅ `ContextMenuCheckboxItem` → `NativeContextMenuCheckboxItem`
- ✅ `ContextMenuRadioItem` → `NativeContextMenuRadioItem`
- ✅ `ContextMenuSeparator` → `NativeContextMenuSeparator`
- And all other components...

## Technical Details

- **Desktop Only**: This component only works in Electron desktop applications
- **No Rendering**: Menu items don't render any DOM elements - they only collect data for the native menu
- **Native Performance**: Uses Electron's native menu system for better performance
- **Type Safety**: Full TypeScript support with proper type checking

## Migration from shadcn context-menu

Replace the imports:

```tsx
// Before
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'

// After
import {
  NativeContextMenu,
  NativeContextMenuTrigger,
  NativeContextMenuContent,
  NativeContextMenuItem,
} from '@/components/ui/native-context-menu'
```

The component usage remains exactly the same!
