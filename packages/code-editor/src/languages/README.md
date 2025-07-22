# Editor Language Configuration Module

This directory contains the editor's language configuration modules, extracting the language configuration logic originally hardcoded in `code-editor.tsx` into independent modules, making the editor more modular and maintainable.

## Architecture Design

### Core Components

1. **LanguageConfigManager** (`index.ts`) - Language configuration manager
   - Unified management of all language configurations
   - Provides interfaces for language configuration and cleanup
   - Handles resource lifecycle management

2. **Python Language Module** (`python.ts`)
   - Configures Python syntax highlighting
   - Defines Python keywords and token rules
   - Provides Python editor default options

3. **TypeScript Language Module** (`typescript.ts`)
   - Configures TypeScript/TSX language support
   - Sets compiler options and diagnostics
   - Configures auto-completion and module resolution
   - Supports intelligent hints for script imports

## Usage

### Using in Editor

```typescript
import { LanguageConfigManager } from "./languages"

// Create language configuration manager instance
const languageConfigManager = new LanguageConfigManager()

// Configure language
const context = {
  scriptPathMappings,
  dynamicPrompt,
  scriptTypes,
  allScripts,
}

languageConfigManager.configureLanguage(monaco, language, context)

// Get editor options
const editorOptions = languageConfigManager.getEditorOptions(language)

// Clean up resources
languageConfigManager.dispose()
```

### Supported Languages

- **Python**: Basic syntax highlighting, keyword recognition
- **TypeScript**: Full TypeScript support, including type checking, auto-completion, module resolution
- **TypeScript React**: TSX support, React component development
- **Other Languages**: Using Monaco Editor built-in support

## Extending New Languages

To add new language support, follow these steps:

1. Create a new language module file in the `languages/` directory, e.g., `javascript.ts`

2. Implement language configuration functions:
```typescript
export function configureJavaScriptLanguage(
  monacoInstance: typeof monaco,
  options: JavaScriptConfigOptions
): void {
  // Configure language-specific settings
}

export function getJavaScriptEditorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  // Return editor options
}
```

3. Add new language handling logic in the `LanguageConfigManager.configureLanguage` method in `index.ts`

4. Update type definitions and exports

## Before and After Refactoring

### Before Refactoring
- All language configuration logic was in `code-editor.tsx`
- Hardcoded language detection and configuration
- Difficult to maintain and extend
- High code coupling

### After Refactoring
- Language configuration logic is modularized
- Each language has independent configuration files
- Unified management interface
- Easy to test and maintain
- Supports resource cleanup and lifecycle management

## Testing

Run tests:
```bash
npm test languages/test.ts
```

Test coverage:
- Python language configuration
- TypeScript language configuration
- Editor options retrieval
- Resource cleanup

## Notes

1. **Resource Management**: Ensure to call the `dispose()` method to clean up resources when components unmount
2. **Monaco Dependency**: All language modules depend on Monaco Editor instances
3. **Backward Compatibility**: Refactoring maintains compatibility with the original API
4. **Performance**: Language configuration is only performed when needed, avoiding unnecessary initialization
