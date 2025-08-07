import * as monaco from 'monaco-editor'
import type { EditorPlugin, TailwindCSSPluginProps } from '../plugin-components'
import { generateTailwindClasses, DEFAULT_TAILWIND_CONFIG, type TailwindConfig } from './tailwind-class-generator'

/**
 * Tailwind CSS class names for autocompletion
 * This is a subset of commonly used classes - can be expanded
 */
const TAILWIND_CLASSES = [
  // Layout
  'container', 'box-border', 'box-content', 'block', 'inline-block', 'inline', 'flex', 'inline-flex',
  'table', 'inline-table', 'table-caption', 'table-cell', 'table-column', 'table-column-group',
  'table-footer-group', 'table-header-group', 'table-row-group', 'table-row', 'flow-root', 'grid',
  'inline-grid', 'contents', 'list-item', 'hidden',

  // Flexbox & Grid
  'flex-row', 'flex-row-reverse', 'flex-col', 'flex-col-reverse', 'flex-wrap', 'flex-wrap-reverse',
  'flex-nowrap', 'flex-1', 'flex-auto', 'flex-initial', 'flex-none', 'grow', 'grow-0', 'shrink',
  'shrink-0', 'order-1', 'order-2', 'order-3', 'order-4', 'order-5', 'order-6', 'order-7', 'order-8',
  'order-9', 'order-10', 'order-11', 'order-12', 'order-first', 'order-last', 'order-none',

  // Grid
  'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5', 'grid-cols-6',
  'grid-cols-7', 'grid-cols-8', 'grid-cols-9', 'grid-cols-10', 'grid-cols-11', 'grid-cols-12',
  'col-auto', 'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4', 'col-span-5', 'col-span-6',
  'col-span-7', 'col-span-8', 'col-span-9', 'col-span-10', 'col-span-11', 'col-span-12', 'col-span-full',

  // Spacing
  'p-0', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-8', 'p-10', 'p-12', 'p-16', 'p-20', 'p-24',
  'px-0', 'px-1', 'px-2', 'px-3', 'px-4', 'px-5', 'px-6', 'px-8', 'px-10', 'px-12', 'px-16', 'px-20', 'px-24',
  'py-0', 'py-1', 'py-2', 'py-3', 'py-4', 'py-5', 'py-6', 'py-8', 'py-10', 'py-12', 'py-16', 'py-20', 'py-24',
  'pt-0', 'pt-1', 'pt-2', 'pt-3', 'pt-4', 'pt-5', 'pt-6', 'pt-8', 'pt-10', 'pt-12', 'pt-16', 'pt-20', 'pt-24',
  'pr-0', 'pr-1', 'pr-2', 'pr-3', 'pr-4', 'pr-5', 'pr-6', 'pr-8', 'pr-10', 'pr-12', 'pr-16', 'pr-20', 'pr-24',
  'pb-0', 'pb-1', 'pb-2', 'pb-3', 'pb-4', 'pb-5', 'pb-6', 'pb-8', 'pb-10', 'pb-12', 'pb-16', 'pb-20', 'pb-24',
  'pl-0', 'pl-1', 'pl-2', 'pl-3', 'pl-4', 'pl-5', 'pl-6', 'pl-8', 'pl-10', 'pl-12', 'pl-16', 'pl-20', 'pl-24',

  'm-0', 'm-1', 'm-2', 'm-3', 'm-4', 'm-5', 'm-6', 'm-8', 'm-10', 'm-12', 'm-16', 'm-20', 'm-24',
  'mx-0', 'mx-1', 'mx-2', 'mx-3', 'mx-4', 'mx-5', 'mx-6', 'mx-8', 'mx-10', 'mx-12', 'mx-16', 'mx-20', 'mx-24',
  'my-0', 'my-1', 'my-2', 'my-3', 'my-4', 'my-5', 'my-6', 'my-8', 'my-10', 'my-12', 'my-16', 'my-20', 'my-24',
  'mt-0', 'mt-1', 'mt-2', 'mt-3', 'mt-4', 'mt-5', 'mt-6', 'mt-8', 'mt-10', 'mt-12', 'mt-16', 'mt-20', 'mt-24',
  'mr-0', 'mr-1', 'mr-2', 'mr-3', 'mr-4', 'mr-5', 'mr-6', 'mr-8', 'mr-10', 'mr-12', 'mr-16', 'mr-20', 'mr-24',
  'mb-0', 'mb-1', 'mb-2', 'mb-3', 'mb-4', 'mb-5', 'mb-6', 'mb-8', 'mb-10', 'mb-12', 'mb-16', 'mb-20', 'mb-24',
  'ml-0', 'ml-1', 'ml-2', 'ml-3', 'ml-4', 'ml-5', 'ml-6', 'ml-8', 'ml-10', 'ml-12', 'ml-16', 'ml-20', 'ml-24',

  // Sizing
  'w-0', 'w-1', 'w-2', 'w-3', 'w-4', 'w-5', 'w-6', 'w-8', 'w-10', 'w-12', 'w-16', 'w-20', 'w-24',
  'w-auto', 'w-px', 'w-0.5', 'w-1.5', 'w-2.5', 'w-3.5', 'w-full', 'w-screen', 'w-min', 'w-max', 'w-fit',
  'w-1/2', 'w-1/3', 'w-2/3', 'w-1/4', 'w-2/4', 'w-3/4', 'w-1/5', 'w-2/5', 'w-3/5', 'w-4/5',

  'h-0', 'h-1', 'h-2', 'h-3', 'h-4', 'h-5', 'h-6', 'h-8', 'h-10', 'h-12', 'h-16', 'h-20', 'h-24',
  'h-auto', 'h-px', 'h-0.5', 'h-1.5', 'h-2.5', 'h-3.5', 'h-full', 'h-screen', 'h-min', 'h-max', 'h-fit',

  // Typography
  'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl',
  'font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black',
  'text-left', 'text-center', 'text-right', 'text-justify',
  'text-black', 'text-white', 'text-gray-50', 'text-gray-100', 'text-gray-200', 'text-gray-300', 'text-gray-400',
  'text-gray-500', 'text-gray-600', 'text-gray-700', 'text-gray-800', 'text-gray-900',
  'text-red-500', 'text-blue-500', 'text-green-500', 'text-yellow-500', 'text-purple-500', 'text-pink-500',

  // Colors
  'bg-transparent', 'bg-current', 'bg-black', 'bg-white',
  'bg-gray-50', 'bg-gray-100', 'bg-gray-200', 'bg-gray-300', 'bg-gray-400', 'bg-gray-500',
  'bg-gray-600', 'bg-gray-700', 'bg-gray-800', 'bg-gray-900',
  'bg-red-50', 'bg-red-100', 'bg-red-200', 'bg-red-300', 'bg-red-400', 'bg-red-500',
  'bg-red-600', 'bg-red-700', 'bg-red-800', 'bg-red-900',
  'bg-blue-50', 'bg-blue-100', 'bg-blue-200', 'bg-blue-300', 'bg-blue-400', 'bg-blue-500',
  'bg-blue-600', 'bg-blue-700', 'bg-blue-800', 'bg-blue-900',
  'bg-green-50', 'bg-green-100', 'bg-green-200', 'bg-green-300', 'bg-green-400', 'bg-green-500',
  'bg-green-600', 'bg-green-700', 'bg-green-800', 'bg-green-900',

  // Border
  'border', 'border-0', 'border-2', 'border-4', 'border-8',
  'border-t', 'border-r', 'border-b', 'border-l',
  'border-gray-200', 'border-gray-300', 'border-gray-400', 'border-gray-500',
  'rounded', 'rounded-none', 'rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full',

  // Effects
  'shadow', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl', 'shadow-inner', 'shadow-none',
  'opacity-0', 'opacity-25', 'opacity-50', 'opacity-75', 'opacity-100',

  // Position
  'static', 'fixed', 'absolute', 'relative', 'sticky',
  'top-0', 'right-0', 'bottom-0', 'left-0',
  'z-0', 'z-10', 'z-20', 'z-30', 'z-40', 'z-50',

  // Display
  'visible', 'invisible', 'overflow-auto', 'overflow-hidden', 'overflow-visible', 'overflow-scroll',

  // Interactive
  'cursor-auto', 'cursor-default', 'cursor-pointer', 'cursor-wait', 'cursor-text', 'cursor-move', 'cursor-not-allowed',
  'select-none', 'select-text', 'select-all', 'select-auto',

  // Common utility combinations
  'flex items-center', 'flex justify-center', 'flex items-center justify-center',
  'flex flex-col', 'flex flex-row', 'grid grid-cols-2', 'grid grid-cols-3',
  'w-full h-full', 'absolute inset-0', 'relative z-10'
]

// Global registry to prevent duplicate registrations
let globalTailwindProviderRegistered = false
let globalTailwindDisposables: monaco.IDisposable[] = []

/**
 * Tailwind CSS Autocomplete Plugin
 */
export class TailwindCSSPlugin implements EditorPlugin {
  name = 'tailwindcss-autocomplete'
  version = '1.0.0'
  private enabled = false
  private disposables: monaco.IDisposable[] = []
  private instanceId = Math.random().toString(36).substring(2, 9)
  private config: TailwindCSSPluginProps
  private generatedClasses: string[] = []

  constructor(config: TailwindCSSPluginProps = {}) {
    this.config = config
    this.generateClassList()
  }

  /**
   * Generate the complete list of Tailwind classes based on configuration
   */
  private generateClassList(): void {
    // Start with default Tailwind classes
    const baseClasses = [...TAILWIND_CLASSES]
    
    // Add custom classes if provided
    if (this.config.customClasses) {
      baseClasses.push(...this.config.customClasses)
    }
    
    // Generate classes from Tailwind config if provided
    if (this.config.tailwindConfig) {
      const generatedFromConfig = generateTailwindClasses(
        this.config.tailwindConfig as TailwindConfig,
        []
      )
      baseClasses.push(...generatedFromConfig)
    } else {
      // Use default Tailwind config to generate common classes
      const generatedFromDefault = generateTailwindClasses(DEFAULT_TAILWIND_CONFIG, [])
      baseClasses.push(...generatedFromDefault)
    }
    
    // Remove duplicates and sort
    this.generatedClasses = [...new Set(baseClasses)].sort()
    
    console.log(`🎨 Generated ${this.generatedClasses.length} Tailwind classes for [${this.instanceId}]`)
  }

  /**
   * Update plugin configuration and regenerate classes
   */
  updateConfig(config: TailwindCSSPluginProps): void {
    this.config = config
    this.generateClassList()
    console.log(`🔄 Updated Tailwind CSS plugin configuration [${this.instanceId}]`)
  }

  async initialize(): Promise<void> {
    if (this.enabled) {
      console.log(`🎨 ${this.name} [${this.instanceId}] already enabled, skipping initialization`)
      return
    }

    console.log(`🎨 Initializing ${this.name} v${this.version} [${this.instanceId}]`)

    try {
      // Check if global provider is already registered
      if (globalTailwindProviderRegistered) {
        console.log(`⚠️ ${this.name} provider already registered globally, disposing previous instance`)
        // Dispose previous global registrations
        globalTailwindDisposables.forEach(disposable => disposable.dispose())
        globalTailwindDisposables = []
        globalTailwindProviderRegistered = false
      }

      // Register completion provider for Tailwind CSS classes
      const completionProvider = monaco.languages.registerCompletionItemProvider(
        ['typescript', 'javascript', 'javascriptreact', 'typescriptreact'],
        {
          triggerCharacters: ['"', "'", ' ', '-'],
          provideCompletionItems: (model, position) => {
            return this.provideTailwindCompletions(model, position)
          }
        }
      )
      
      // Track both locally and globally
      this.disposables.push(completionProvider)
      globalTailwindDisposables.push(completionProvider)
      globalTailwindProviderRegistered = true

      this.enabled = true
      console.log(`✅ ${this.name} [${this.instanceId}] initialized successfully`)
    } catch (error) {
      console.error(`❌ Failed to initialize ${this.name} [${this.instanceId}]:`, error)
      throw error
    }
  }

  dispose(): void {
    // Store reference to disposables before clearing
    const disposablesToRemove = [...this.disposables]
    
    this.disposables.forEach(disposable => disposable.dispose())
    this.disposables = []
    this.enabled = false
    
    // Update global state - remove this instance's disposables from global tracking
    globalTailwindDisposables = globalTailwindDisposables.filter(disposable => 
      !disposablesToRemove.includes(disposable)
    )
    
    if (globalTailwindDisposables.length === 0) {
      globalTailwindProviderRegistered = false
    }
    
    console.log(`🗑️ ${this.name} [${this.instanceId}] disposed`)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  enable(): void {
    if (!this.enabled) {
      this.initialize().catch(console.error)
    }
  }

  disable(): void {
    this.dispose()
  }

  /**
   * Provide Tailwind CSS class completions
   */
  private provideTailwindCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): monaco.languages.CompletionList | null {
    const lineContent = model.getLineContent(position.lineNumber)
    const beforeCursor = lineContent.substring(0, position.column - 1)

    // Check if we're inside a className prop or class attribute
    const classNameMatch = beforeCursor.match(/(?:className|class)=['"]([^'"]*?)$/)
    if (!classNameMatch) {
      return null
    }

    const currentClasses = classNameMatch[1]
    const lastSpaceIndex = currentClasses.lastIndexOf(' ')
    const currentClass = lastSpaceIndex >= 0 ? currentClasses.substring(lastSpaceIndex + 1) : currentClasses

    // Filter generated Tailwind classes based on current input
    const suggestions = this.generatedClasses
      .filter(className => {
        if (!currentClass) return true
        return className.toLowerCase().includes(currentClass.toLowerCase())
      })
      .slice(0, 50) // Limit suggestions to avoid performance issues
      .map(className => ({
        label: className,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: className,
        detail: 'Tailwind CSS',
        documentation: this.getClassDocumentation(className),
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - currentClass.length,
          endColumn: position.column,
        }
      }))

    return {
      suggestions
    }
  }

  /**
   * Get documentation for a Tailwind CSS class
   */
  private getClassDocumentation(className: string): string {
    // Provide contextual documentation based on class name patterns
    if (className.startsWith('text-')) {
      if (className.match(/text-(xs|sm|base|lg|xl|\d+xl)/)) {
        return `Font size: ${className}`
      } else {
        return `Text color: ${className}`
      }
    }
    
    if (className.startsWith('bg-')) {
      return `Background color: ${className}`
    }
    
    if (className.startsWith('p-') || className.startsWith('px-') || className.startsWith('py-') || 
        className.startsWith('pt-') || className.startsWith('pr-') || className.startsWith('pb-') || className.startsWith('pl-')) {
      return `Padding: ${className}`
    }
    
    if (className.startsWith('m-') || className.startsWith('mx-') || className.startsWith('my-') || 
        className.startsWith('mt-') || className.startsWith('mr-') || className.startsWith('mb-') || className.startsWith('ml-')) {
      return `Margin: ${className}`
    }
    
    if (className.startsWith('w-')) {
      return `Width: ${className}`
    }
    
    if (className.startsWith('h-')) {
      return `Height: ${className}`
    }
    
    if (className.startsWith('flex')) {
      return `Flexbox: ${className}`
    }
    
    if (className.startsWith('grid')) {
      return `Grid: ${className}`
    }
    
    if (className.startsWith('border')) {
      return `Border: ${className}`
    }
    
    if (className.startsWith('rounded')) {
      return `Border radius: ${className}`
    }
    
    if (className.startsWith('shadow')) {
      return `Box shadow: ${className}`
    }
    
    // Check if it's a custom class
    if (this.config.customClasses?.includes(className)) {
      return `Custom class: ${className}`
    }
    
    return `Tailwind CSS class: ${className}`
  }
}