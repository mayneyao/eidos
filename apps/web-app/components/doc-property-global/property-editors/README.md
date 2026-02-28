# Property Editors

This directory contains modular property editor components for different property types in the document property system.

## Architecture

### Base Components

- **`base-editor.tsx`**: Provides common wrapper components and utilities
- **`types.ts`**: TypeScript interfaces and types for all editors

### Editor Components

Each property type has its own dedicated editor component:

- **`text-editor.tsx`**: Text input with inline editing
- **`number-editor.tsx`**: Numeric input with validation
- **`boolean-editor.tsx`**: Checkbox component (no edit mode needed)
- **`date-editor.tsx`**: Date picker with proper formatting
- **`tags-editor.tsx`**: Comma-separated tags with visual formatting

### Factory System

- **`editor-factory.tsx`**: Registry and factory for creating appropriate editors
- **`index.ts`**: Main export file for the module

## Usage

### Basic Usage

```tsx
import { PropertyEditorFactory } from "./property-editors"
;<PropertyEditorFactory
  propertyType="text"
  value={currentValue}
  onChange={handleChange}
  isEditing={isEditing}
  onFinishEdit={handleFinishEdit}
  onStartEdit={handleStartEdit}
/>
```

### Direct Editor Usage

```tsx
import { TextEditor } from "./property-editors"
;<TextEditor
  propertyType="text"
  value={currentValue}
  onChange={handleChange}
  // ... other props
/>
```

## Features

### Common Features (All Editors)

- ✅ Display mode with click-to-edit
- ✅ Empty value handling with placeholder
- ✅ Readonly mode support
- ✅ System property protection
- ✅ Keyboard navigation (Enter/Escape)
- ✅ Auto-focus support
- ✅ Consistent styling

### Type-Specific Features

#### Text Editor

- Inline text editing
- Auto-select on focus

#### Number Editor

- Input validation (numbers only)
- Locale-aware display formatting
- Decimal support

#### Boolean Editor

- Direct checkbox interaction
- No edit mode (always interactive)
- Visual state feedback

#### Date Editor

- Native date picker
- Proper date formatting for display
- ISO date storage format

#### Tags Editor

- Comma-separated input
- Visual tag chips in display mode
- Tag parsing and cleanup

## Extension

To add a new property type:

1. Create a new editor component (e.g., `email-editor.tsx`)
2. Implement the `PropertyEditorProps` interface
3. Add it to the registry in `editor-factory.tsx`
4. Update the `PropertyType` union in `../types.ts`
5. Export from `index.ts`

## Design Principles

1. **Consistency**: All editors follow the same interaction patterns
2. **Accessibility**: Keyboard navigation and screen reader support
3. **Performance**: Minimal re-renders and efficient state management
4. **Extensibility**: Easy to add new property types
5. **Type Safety**: Full TypeScript support with proper interfaces
