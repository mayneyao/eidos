# Plugin System Migration Guide

This document explains how the new plugin system works and how to avoid common issues like duplicate import suggestions.

## Problem: Duplicate Rendering

The old system and new system could run simultaneously, causing duplicate import suggestions and other issues.

## Root Causes Fixed

1. **Global Plugin Manager**: Removed automatic initialization in `monaco-setup.ts`
2. **Dual Configuration**: Fixed conflict between `customImportSuggestions` prop and plugin-based configuration
3. **Multiple Plugin Instances**: Ensured only one plugin manager per editor instance

## New Usage Patterns

### ✅ Correct: Using Plugin Components

```tsx
<SimpleCodeEditor initialCode="...">
  <ESMImportResolverPlugin
    enableAutoTypeResolution={true}
    customImportSuggestions={suggestions}
  />
</SimpleCodeEditor>
```

### ❌ Avoid: Mixing Old and New Approaches

```tsx
{/* Don't do this - causes duplicates */}
<SimpleCodeEditor 
  initialCode="..."
  customImportSuggestions={suggestions} // Old way
>
  <ESMImportResolverPlugin // New way
    customImportSuggestions={suggestions} // Duplicate!
  />
</SimpleCodeEditor>
```

### ✅ Correct: Legacy Support Mode

```tsx
{/* This works - no plugin components, uses legacy mode */}
<SimpleCodeEditor 
  initialCode="..."
  customImportSuggestions={suggestions}
/>
```

## Migration Checklist

- [ ] Remove `customImportSuggestions` prop when using `ESMImportResolverPlugin`
- [ ] Use plugin components for configuration instead of direct props
- [ ] Test that import suggestions appear only once
- [ ] Check console for plugin initialization logs

## Backward Compatibility

The system maintains backward compatibility:

1. **No plugins specified**: Automatically enables ESM resolver with default config
2. **Legacy props**: Still work when no plugin components are used
3. **Mixed usage**: Legacy props are ignored when plugin components are present

## Debugging

Check console logs for:
- `🔄 Plugin configurations changed, updating...`
- `✅ ESM plugin initialized`
- Duplicate plugin initialization messages (shouldn't happen)

If you see duplicate suggestions, ensure you're not mixing old and new configuration approaches.