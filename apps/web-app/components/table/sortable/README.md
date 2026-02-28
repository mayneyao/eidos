# Sortable Components

A generic, reusable sortable component system built on top of `@dnd-kit`.

## Components

### SortableContainer

A generic container that handles drag and drop functionality for any list of items. This component has been successfully used to refactor three existing sort components in the codebase:

- `view-field.tsx` - Field ordering in table views
- `view-sort-editor.tsx` - Sort rule configuration
- `view-toolbar.tsx` - View ordering in dropdown

```tsx
import { SortableContainer } from "@/components/table/sortable"

interface MyItem {
  id: string
  name: string
  // ... other properties
}

const items: MyItem[] = [
  { id: "1", name: "Item 1" },
  { id: "2", name: "Item 2" },
  { id: "3", name: "Item 3" },
]

function MySortableList() {
  const handleReorder = (newItems: MyItem[]) => {
    // Handle reordering logic
    console.log("New order:", newItems)
  }

  return (
    <SortableContainer
      items={items}
      onReorder={handleReorder}
      className="space-y-2"
      renderItem={(item, index) => (
        <div key={item.id} className="p-2 border rounded">
          {item.name}
        </div>
      )}
    />
  )
}
```

### SortableItem

A generic sortable item wrapper that can be used with any content.

```tsx
import { SortableItem } from "@/components/table/sortable"

function MySortableItem({ item }: { item: MyItem }) {
  return (
    <SortableItem
      id={item.id}
      className="p-2 border rounded hover:bg-gray-50"
      dragHandleClassName="cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4" />
        <span>{item.name}</span>
      </div>
    </SortableItem>
  )
}
```

## Real-world Usage Examples

### Field Ordering (view-field.tsx)

```tsx
<SortableContainer
  items={cards.map((card) => ({ ...card, id: card.table_column_name }))}
  onReorder={handleReorder}
  className="max-h-[320px] w-[280px] overflow-y-auto overflow-x-hidden"
  renderItem={(item, index) => (
    <FieldItemCard
      field={item as IField}
      // ... other props
    />
  )}
/>
```

### Sort Rules (view-sort-editor.tsx)

```tsx
<SortableContainer
  items={orderItems.map((item) => ({ ...item, id: item.column }))}
  onReorder={handleReorder}
  renderItem={(item, index) => (
    <SortableItem
      item={item}
      // ... other props
    />
  )}
/>
```

### View Ordering (view-toolbar.tsx)

```tsx
<SortableContainer
  items={localViews}
  onReorder={handleReorder}
  className="space-y-1 overflow-hidden"
  renderItem={(view, index) => (
    <ViewItem
      view={view}
      // ... other props
    />
  )}
/>
```

## Features

- **Generic TypeScript support**: Works with any item type that has an `id` property
- **Consistent drag behavior**: Same activation distance and keyboard support across all components
- **Real-time preview**: Items reorder immediately during drag
- **Accessibility**: Full keyboard navigation support
- **Customizable**: Flexible rendering and styling options

## Props

### SortableContainer

| Prop                 | Type                                    | Description                                   |
| -------------------- | --------------------------------------- | --------------------------------------------- |
| `items`              | `T[]`                                   | Array of items to sort                        |
| `onReorder`          | `(newItems: T[]) => void`               | Callback when items are reordered             |
| `renderItem`         | `(item: T, index: number) => ReactNode` | Function to render each item                  |
| `className`          | `string`                                | CSS classes for the container                 |
| `itemClassName`      | `string`                                | CSS classes for each item wrapper             |
| `disabled`           | `boolean`                               | Disable drag and drop                         |
| `activationDistance` | `number`                                | Distance in pixels to start drag (default: 8) |

### SortableItem

| Prop                  | Type         | Description                       |
| --------------------- | ------------ | --------------------------------- |
| `id`                  | `string`     | Unique identifier for the item    |
| `children`            | `ReactNode`  | Content to render inside the item |
| `className`           | `string`     | CSS classes for the item          |
| `dragHandleClassName` | `string`     | CSS classes for the drag handle   |
| `disabled`            | `boolean`    | Disable dragging for this item    |
| `isDragging`          | `boolean`    | External drag state               |
| `onDragStart`         | `() => void` | Callback when drag starts         |
| `onDragEnd`           | `() => void` | Callback when drag ends           |
