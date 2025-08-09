/**
 * ESM Import Resolver Plugin
 * Provides ESM import resolution and autocompletion for external packages
 */

import * as monaco from 'monaco-editor'
import { ImportParser } from './services/import-parser'
import { URLResolver } from './services/url-resolver'
import { TypeDefinitionManager } from './services/type-definition'
import { MonacoIntegration } from './services/monaco-integration'

// Re-export all services and interfaces for external use
export * from './services'
export * from './interfaces'

// Import interfaces from the proper location
import type { EditorPlugin } from '../base-types'
import type { ESMImportResolverProps, ImportSuggestion } from './types'

// Re-export the props interface for convenience
export type { ESMImportResolverProps, ImportSuggestion }

// Global state to prevent duplicate Monaco service registrations
let globalESMProviderRegistered = false
let globalESMDisposables: monaco.IDisposable[] = []

/**
 * ESM Import Resolver Plugin Implementation
 * Migrated from plugin-manager.ts and enhanced with new architecture
 */
export class ESMImportResolverPlugin implements EditorPlugin {
  name = 'esm-import-resolver'
  version = '1.0.0'
  private instanceId = Math.random().toString(36).substr(2, 9)

  private enabled = false
  private importParser: ImportParser
  private urlResolver: URLResolver
  private typeDefinitionManager: TypeDefinitionManager
  private monacoIntegration: MonacoIntegration
  private disposables: monaco.IDisposable[] = []
  private customImportSuggestions: ImportSuggestion[] = []

  constructor(private config: ESMImportResolverProps = {}) {
    console.log(`🔌 Creating new ESMImportResolverPlugin instance [${this.instanceId}]`)

    // Set default config
    this.config = {
      enabled: true,
      esmServerUrl: 'https://esm.sh',
      enableAutoTypeResolution: true,
      packageWhitelist: [],
      packageBlacklist: [],
      customImportSuggestions: [],
      ...config
    } as ESMImportResolverProps

    this.importParser = new ImportParser()
    this.urlResolver = new URLResolver()
    this.typeDefinitionManager = new TypeDefinitionManager()
    this.monacoIntegration = new MonacoIntegration()

    // Configure URL resolver
    if (this.config.esmServerUrl) {
      this.urlResolver.setEsmServerUrl(this.config.esmServerUrl)
    }

    if (this.config.packageWhitelist) {
      this.config.packageWhitelist.forEach(pkg => this.urlResolver.addToWhitelist(pkg))
    }

    if (this.config.packageBlacklist) {
      this.config.packageBlacklist.forEach(pkg => this.urlResolver.addToBlacklist(pkg))
    }

    // Store custom import suggestions
    if (this.config.customImportSuggestions) {
      this.customImportSuggestions = this.config.customImportSuggestions
    }
  }

  async initialize(): Promise<void> {
    if (this.enabled) {
      console.log(`🔌 ${this.name} [${this.instanceId}] already enabled, skipping initialization`)
      return
    }

    console.log(`🔌 Initializing ${this.name} v${this.version} [${this.instanceId}]`)

    try {
      // Check if global provider is already registered
      if (globalESMProviderRegistered) {
        console.log(`⚠️ ${this.name} provider already registered globally, disposing previous instance`)
        // Dispose previous global registrations
        globalESMDisposables.forEach(disposable => disposable.dispose())
        globalESMDisposables = []
        globalESMProviderRegistered = false
      }

      // Dispose any existing local disposables first to prevent duplicates
      this.dispose()

      // Register completion provider for ESM imports
      const completionProvider = monaco.languages.registerCompletionItemProvider(
        ['typescript'],
        {
          triggerCharacters: ['"', "'", '/'],
          provideCompletionItems: async (model, position) => {
            return this.provideImportCompletions(model, position)
          }
        }
      )
      
      // Track both locally and globally
      this.disposables.push(completionProvider)
      globalESMDisposables.push(completionProvider)
      console.log(`✅ Registered completion provider for ${this.name} [${this.instanceId}]`)

      // Register hover provider for import information
      const hoverProvider = monaco.languages.registerHoverProvider(
        ['typescript'],
        {
          provideHover: async (model, position) => {
            return this.provideImportHover(model, position)
          }
        }
      )
      
      // Track both locally and globally
      this.disposables.push(hoverProvider)
      globalESMDisposables.push(hoverProvider)
      console.log(`✅ Registered hover provider for ${this.name} [${this.instanceId}]`)

      // Register code action provider for import resolution
      const codeActionProvider = monaco.languages.registerCodeActionProvider(
        ['typescript'],
        {
          provideCodeActions: async (model, range, context) => {
            return this.provideImportCodeActions(model, range, context)
          }
        }
      )
      
      // Track both locally and globally
      this.disposables.push(codeActionProvider)
      globalESMDisposables.push(codeActionProvider)
      console.log(`✅ Registered code action provider for ${this.name} [${this.instanceId}]`)

      // Mark global provider as registered
      globalESMProviderRegistered = true

      // Configure TypeScript compiler options for ESM support
      this.configureCompilerOptions()

      this.enabled = true
      console.log(`✅ ${this.name} [${this.instanceId}] initialized successfully`)
      console.log(`📊 Global ESM disposables count: ${globalESMDisposables.length}`)
    } catch (error) {
      console.error(`❌ Failed to initialize ${this.name} [${this.instanceId}]:`, error)
      throw error
    }
  }

  dispose(): void {
    console.log(`🔌 Disposing ${this.name} [${this.instanceId}]`)

    // Store reference to disposables before clearing
    const disposablesToRemove = [...this.disposables]
    
    // Remove from global tracking
    globalESMDisposables = globalESMDisposables.filter(disposable => 
      !disposablesToRemove.includes(disposable)
    )
    
    // Dispose local disposables
    disposablesToRemove.forEach(disposable => disposable.dispose())
    this.disposables = []
    this.enabled = false

    // Reset global state if no more disposables exist
    if (globalESMDisposables.length === 0) {
      globalESMProviderRegistered = false
    }

    console.log(`✅ ${this.name} [${this.instanceId}] disposed`)
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
   * Update custom import suggestions
   */
  updateCustomImportSuggestions(suggestions: ImportSuggestion[]): void {
    this.customImportSuggestions = suggestions
    console.log(`📝 Updated custom import suggestions: ${suggestions.length} items`)
  }

  /**
   * Get current custom import suggestions
   */
  getCustomImportSuggestions(): ImportSuggestion[] {
    return [...this.customImportSuggestions]
  }

  /**
   * Setup model listeners for a specific model
   */
  setupModelListeners(model: monaco.editor.ITextModel): void {
    if (!this.enabled) {
      console.log('ESM plugin not enabled, skipping model listeners')
      return
    }

    console.log(`🔗 Setting up ESM plugin listeners for model: ${model.uri.toString()}`)

    // Listen for content changes on this specific model
    const disposable = model.onDidChangeContent(async () => {
      if (this.config?.enableAutoTypeResolution) {
        console.log(`📝 Content changed in ${model.uri.toString()}, analyzing imports...`)
        await this.analyzeAndResolveImports(model)
      }
    })

    this.disposables.push(disposable)

    // Analyze imports immediately
    if (this.config?.enableAutoTypeResolution) {
      console.log(`🔍 Analyzing imports immediately for ${model.uri.toString()}`)
      this.analyzeAndResolveImports(model).catch(console.warn)
    }
  }

  /**
   * Provide import completions for package names
   */
  private async provideImportCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.CompletionList | null> {
    const lineContent = model.getLineContent(position.lineNumber)
    const beforeCursor = lineContent.substring(0, position.column - 1)

    // Check if we're in an import statement
    const importMatch = beforeCursor.match(/import\s+.*?from\s+['"]([^'"]*?)$/)
    if (!importMatch) {
      return null
    }

    const partialImport = importMatch[1]

    // Create range for the partial import text
    const startColumn = position.column - partialImport.length
    const range = new monaco.Range(
      position.lineNumber,
      startColumn,
      position.lineNumber,
      position.column
    )

    // Use custom import suggestions if provided, otherwise use default suggestions
    const baseSuggestions = this.customImportSuggestions.length > 0
      ? this.customImportSuggestions
      : this.getDefaultImportSuggestions()

    const suggestions: monaco.languages.CompletionItem[] = baseSuggestions
      .filter((item: ImportSuggestion) => item.label.includes(partialImport))
      .map((item: ImportSuggestion) => ({
        label: item.label,
        kind: item.kind || monaco.languages.CompletionItemKind.Module,
        insertText: item.insertText,
        detail: item.detail,
        documentation: item.documentation,
        range: range
      }))

    return {
      suggestions
    }
  }

  /**
   * Get default import suggestions when no custom suggestions are provided
   */
  private getDefaultImportSuggestions(): ImportSuggestion[] {
    return [
      {
        label: 'react',
        insertText: 'react',
        detail: 'React library',
        documentation: 'A JavaScript library for building user interfaces',
        kind: monaco.languages.CompletionItemKind.Module
      },
      {
        label: 'lodash',
        insertText: 'lodash',
        detail: 'Lodash utility library',
        documentation: 'A modern JavaScript utility library',
        kind: monaco.languages.CompletionItemKind.Module
      },
      {
        label: 'axios',
        insertText: 'axios',
        detail: 'HTTP client library',
        documentation: 'Promise based HTTP client for the browser and node.js',
        kind: monaco.languages.CompletionItemKind.Module
      }
    ]
  }

  /**
   * Provide hover information for imports
   */
  private async provideImportHover(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.Hover | null> {
    const word = model.getWordAtPosition(position)
    if (!word) return null

    const lineContent = model.getLineContent(position.lineNumber)
    const importMatch = lineContent.match(/import\s+.*?from\s+['"]([^'"]+)['"]/)

    if (!importMatch) return null

    const importPath = importMatch[1]
    const resolvedUrl = this.urlResolver.resolvePackageUrl(importPath)
    const metadata = this.urlResolver.getPackageMetadata(importPath)

    const contents: monaco.IMarkdownString[] = [
      {
        value: `**Import:** \`${importPath}\``
      },
      {
        value: `**Resolved URL:** \`${resolvedUrl}\``
      }
    ]

    if (!metadata.isNodeBuiltin && !metadata.isRelative) {
      contents.push({
        value: `**Type:** Third-party package`
      })
    }

    if (metadata.isNodeBuiltin) {
      contents.push({
        value: `**Type:** Node.js builtin module`
      })
    }

    if (metadata.version) {
      contents.push({
        value: `**Version:** \`${metadata.version}\``
      })
    }

    return {
      range: new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      ),
      contents
    }
  }

  /**
   * Provide code actions for import resolution
   */
  private async provideImportCodeActions(
    model: monaco.editor.ITextModel,
    _range: monaco.Range,
    _context: monaco.languages.CodeActionContext
  ): Promise<monaco.languages.CodeActionList | null> {
    const actions: monaco.languages.CodeAction[] = []

    // Add action to resolve all imports in the file
    actions.push({
      title: 'Resolve all ESM imports',
      kind: 'quickfix',
      edit: {
        edits: []
      },
      command: {
        id: 'esm-resolver.resolve-all-imports',
        title: 'Resolve all ESM imports',
        arguments: [model.uri.toString()]
      }
    })

    return {
      actions,
      dispose: () => { }
    }
  }

  /**
   * Analyze and resolve imports in a model
   */
  private async analyzeAndResolveImports(model: monaco.editor.ITextModel): Promise<void> {
    try {
      const content = model.getValue()
      const filePath = model.uri.path

      console.log(`🔍 Starting import analysis for ${filePath}`)

      const imports = await this.importParser.parseImports(content, filePath)

      console.log(`📦 Found ${imports.length} imports in ${filePath}:`)
      imports.forEach((imp, index) => {
        try {
          console.log(`  ${index + 1}. ${imp.source} -> ${imp.resolved}`)
        } catch (logError) {
          console.warn(`Error logging import ${index}:`, logError)
        }
      })

      // Fetch and register type definitions for third-party packages
      try {
        const thirdPartyImports = imports
          .filter(imp => imp.isThirdParty && !imp.isNodeBuiltin)
          .map(imp => imp.resolved)

        if (thirdPartyImports.length > 0) {
          console.log(`🔍 Fetching types for ${thirdPartyImports.length} packages...`)

          // Fetch type definitions
          const typeDefinitions = await Promise.all(
            thirdPartyImports.map(async (packageUrl) => {
              try {
                return await this.typeDefinitionManager.fetchTypes(packageUrl)
              } catch (error) {
                console.warn(`Failed to fetch types for ${packageUrl}:`, error)
                return null
              }
            })
          )

          // Filter out null results and register with Monaco
          const validTypes = typeDefinitions.filter(type => type !== null)
          if (validTypes.length > 0) {
            console.log(`📝 Registering ${validTypes.length} type definitions with Monaco...`)
            this.monacoIntegration.registerTypeDefinitions(validTypes)
            console.log('✅ Type definitions registered successfully!')
          }
        }
      } catch (typeError) {
        console.warn('Error in type fetching and registration:', typeError)
      }

      console.log(`✅ Import analysis completed for ${filePath}`)
    } catch (error) {
      console.error(`❌ Failed to analyze imports for ${model.uri.path}:`, error)
      // Don't rethrow to prevent breaking the editor
    }
  }

  /**
   * Configure TypeScript compiler options for ESM support
   */
  private configureCompilerOptions(): void {
    console.log('⚙️ Configuring TypeScript compiler options for ESM support')

    const compilerOptions: monaco.languages.typescript.CompilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      allowJs: true,
      checkJs: false,
      jsx: monaco.languages.typescript.JsxEmit.React,
      strict: false, // Relaxed for demo purposes
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      // Enable type checking for imports
      typeRoots: ['node_modules/@types'],
      // Allow importing from node_modules
      baseUrl: '.',
      paths: {
        '*': ['node_modules/*', 'node_modules/@types/*']
      }
    }

    this.monacoIntegration.updateCompilerOptions(compilerOptions)
    console.log('✅ TypeScript compiler options configured')
  }
}