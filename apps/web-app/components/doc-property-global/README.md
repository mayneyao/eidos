# Doc Property Global Component

This directory contains a refactored version of the DocPropertyGlobal component, broken down into smaller, more manageable pieces for better maintainability and reusability.

## Structure

### Core Files

- **`index.tsx`** - Main component that orchestrates all the sub-components
- **`hook.ts`** - Custom hooks for property and meta data management
- **`types.ts`** - TypeScript type definitions

### Sub-components

- **`property-icon.tsx`** - Icon component for different property types
- **`property-item.tsx`** - Individual property display and editing component
- **`property-dropdown.tsx`** - Dropdown for selecting existing properties
- **`add-property-input.tsx`** - Input component for creating new properties

### Utilities

- **`utils.ts`** - Utility functions for property type inference and formatting

## Benefits of Refactoring

### Before (Single File - 550 lines)

- Complex component with multiple responsibilities
- Difficult to test individual features
- Hard to maintain and understand
- Tightly coupled logic

### After (Multiple Files - ~150 lines each)

- **Separation of Concerns**: Each component has a single responsibility
- **Reusability**: Sub-components can be used independently
- **Testability**: Easier to write unit tests for individual components
- **Maintainability**: Smaller files are easier to understand and modify
- **Type Safety**: Centralized type definitions

## Component Responsibilities

### PropertyIcon

- Renders appropriate icon based on property type
- Handles type-to-icon mapping

### PropertyItem

- Displays property name and value
- Handles inline editing
- Manages edit/view state transitions
- Provides delete functionality

### PropertyDropdown

- Shows available properties for selection
- Provides search/filter functionality
- Handles keyboard navigation
- Manages dropdown state

### AddPropertyInput

- Handles new property name input
- Manages input validation
- Provides keyboard shortcuts (Enter/Escape)

### Main Component (index.tsx)

- Orchestrates all sub-components
- Manages global state
- Handles API calls
- Coordinates component interactions

## Usage

The component maintains the same external API:

```tsx
import { DocPropertyGlobal } from "./doc-property-global"

;<DocPropertyGlobal docId="your-doc-id" />
```

## Development Notes

- All components follow React best practices
- TypeScript is used throughout for type safety
- Components are designed to be easily testable
- Consistent naming conventions are used
- Error handling is centralized where appropriate
