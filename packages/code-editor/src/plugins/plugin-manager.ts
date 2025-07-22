/**
 * Plugin Manager for Code Editor
 * Manages the lifecycle and coordination of editor plugins
 */

import * as monaco from 'monaco-editor'
import { ImportParser } from './esm-import-resolver/services/import-parser'
import { URLResolver } from './esm-import-resolver/services/url-resolver'
import { TypeDefinitionManager } from './esm-import-resolver/services/type-definition'
import { MonacoIntegration } from './esm-import-resolver/services/monaco-integration'

export interface Plugin {
  name: string
  version: string
  initialize(): Promise<void>
  dispose(): void
  isEnabled(): boolean
  enable(): void
  disable(): void
}

export interface PluginManagerOptions {
  enableESMResolver?: boolean
  esmResolverConfig?: {
    esmServerUrl?: string
    packageWhitelist?: string[]
    packageBlacklist?: string[]
    enableAutoTypeResolution?: boolean
  }
}

/**
 * ESM Import Resolver Plugin Implementation
 */
export class ESMImportResolverPlugin implements Plugin {
  name = 'ESM Import Resolver'
  version = '1.0.0'

  private enabled = false
  private importParser: ImportParser
  private urlResolver: URLResolver
  private typeDefinitionManager: TypeDefinitionManager
  private monacoIntegration: MonacoIntegration
  private disposables: monaco.IDisposable[] = []

  constructor(private options: PluginManagerOptions['esmResolverConfig'] = {}) {
    this.importParser = new ImportParser()
    this.urlResolver = new URLResolver()
    this.typeDefinitionManager = new TypeDefinitionManager()
    this.monacoIntegration = new MonacoIntegration()

    // Configure URL resolver
    if (options.esmServerUrl) {
      this.urlResolver.setEsmServerUrl(options.esmServerUrl)
    }

    if (options.packageWhitelist) {
      options.packageWhitelist.forEach(pkg => this.urlResolver.addToWhitelist(pkg))
    }

    if (options.packageBlacklist) {
      options.packageBlacklist.forEach(pkg => this.urlResolver.addToBlacklist(pkg))
    }
  }

  async initialize(): Promise<void> {
    if (this.enabled) return

    console.log(`🔌 Initializing ${this.name} v${this.version}`)

    try {
      // Register completion provider for ESM imports
      const completionProvider = monaco.languages.registerCompletionItemProvider(
        ['typescript', 'javascript'],
        {
          triggerCharacters: ['"', "'", '/'],
          provideCompletionItems: async (model, position) => {
            return this.provideImportCompletions(model, position)
          }
        }
      )
      this.disposables.push(completionProvider)

      // Register hover provider for import information
      const hoverProvider = monaco.languages.registerHoverProvider(
        ['typescript', 'javascript'],
        {
          provideHover: async (model, position) => {
            return this.provideImportHover(model, position)
          }
        }
      )
      this.disposables.push(hoverProvider)

      // Register code action provider for import resolution
      const codeActionProvider = monaco.languages.registerCodeActionProvider(
        ['typescript', 'javascript'],
        {
          provideCodeActions: async (model, range, context) => {
            return this.provideImportCodeActions(model, range, context)
          }
        }
      )
      this.disposables.push(codeActionProvider)

      // Configure TypeScript compiler options for ESM support
      this.configureCompilerOptions()

      // Listen for model content changes to update import analysis
      // We'll set this up when models are created, not globally
      // For now, we'll analyze imports when the plugin is initialized

      this.enabled = true
      console.log(`✅ ${this.name} initialized successfully`)
    } catch (error) {
      console.error(`❌ Failed to initialize ${this.name}:`, error)
      throw error
    }
  }

  dispose(): void {
    console.log(`🔌 Disposing ${this.name}`)

    this.disposables.forEach(disposable => disposable.dispose())
    this.disposables = []
    this.enabled = false

    console.log(`✅ ${this.name} disposed`)
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

    // For now, provide basic suggestions
    // In a full implementation, this would query a package registry
    const suggestions: monaco.languages.CompletionItem[] = [
      {
        label: 'react',
        kind: monaco.languages.CompletionItemKind.Module,
        insertText: 'react',
        detail: 'React library',
        documentation: 'A JavaScript library for building user interfaces',
        range: range
      },
      {
        label: 'lodash',
        kind: monaco.languages.CompletionItemKind.Module,
        insertText: 'lodash',
        detail: 'Lodash utility library',
        documentation: 'A modern JavaScript utility library',
        range: range
      },
      {
        label: 'axios',
        kind: monaco.languages.CompletionItemKind.Module,
        insertText: 'axios',
        detail: 'HTTP client library',
        documentation: 'Promise based HTTP client for the browser and node.js',
        range: range
      }
    ].filter(item => item.label.includes(partialImport))

    return {
      suggestions
    }
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
      if (this.options?.enableAutoTypeResolution) {
        console.log(`📝 Content changed in ${model.uri.toString()}, analyzing imports...`)
        await this.analyzeAndResolveImports(model)
      }
    })

    this.disposables.push(disposable)

    // Analyze imports immediately
    if (this.options?.enableAutoTypeResolution) {
      console.log(`🔍 Analyzing imports immediately for ${model.uri.toString()}`)
      this.analyzeAndResolveImports(model).catch(console.warn)
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

/**
 * Plugin Manager
 */
export class PluginManager {
  private plugins = new Map<string, Plugin>()
  private initialized = false

  constructor(private options: PluginManagerOptions = {}) { }

  async initialize(): Promise<void> {
    if (this.initialized) return

    console.log('🔌 Initializing Plugin Manager')

    // Initialize ESM Import Resolver plugin if enabled
    if (this.options.enableESMResolver !== false) {
      const esmPlugin = new ESMImportResolverPlugin(this.options.esmResolverConfig)
      this.plugins.set('esm-import-resolver', esmPlugin)
      await esmPlugin.initialize()
    }

    this.initialized = true
    console.log('✅ Plugin Manager initialized')
  }

  dispose(): void {
    console.log('🔌 Disposing Plugin Manager')

    this.plugins.forEach(plugin => plugin.dispose())
    this.plugins.clear()
    this.initialized = false

    console.log('✅ Plugin Manager disposed')
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name)
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  isInitialized(): boolean {
    return this.initialized
  }
}

// Global plugin manager instance
let globalPluginManager: PluginManager | null = null

export function getPluginManager(): PluginManager {
  if (!globalPluginManager) {
    globalPluginManager = new PluginManager({
      enableESMResolver: true,
      esmResolverConfig: {
        enableAutoTypeResolution: true,
        packageWhitelist: [], // Empty means allow all
        packageBlacklist: [] // Empty means block none
      }
    })
  }
  return globalPluginManager
}

export function disposePluginManager(): void {
  if (globalPluginManager) {
    globalPluginManager.dispose()
    globalPluginManager = null
  }
}
