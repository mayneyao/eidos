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

export interface ImportSuggestion {
  label: string
  insertText: string
  detail?: string
  documentation?: string
  kind?: monaco.languages.CompletionItemKind
}

export interface ESMResolverConfig {
  esmServerUrl?: string
  packageWhitelist?: string[]
  packageBlacklist?: string[]
  enableAutoTypeResolution?: boolean
  customImportSuggestions?: ImportSuggestion[]
}

/**
 * ESM Import Resolver Plugin Implementation
 */
export class ESMImportResolverPlugin implements Plugin {
  name = 'ESM Import Resolver'
  version = '1.0.0'
  private instanceId = Math.random().toString(36).substr(2, 9)

  private enabled = false
  private importParser: ImportParser
  private urlResolver: URLResolver
  private typeDefinitionManager: TypeDefinitionManager
  private monacoIntegration: MonacoIntegration
  private disposables: monaco.IDisposable[] = []
  private customImportSuggestions: ImportSuggestion[] = []

  constructor(private options: ESMResolverConfig = {}) {
    console.log(`🔌 Creating new ESMImportResolverPlugin instance [${this.instanceId}]`)
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

    // Store custom import suggestions
    if (options.customImportSuggestions) {
      this.customImportSuggestions = options.customImportSuggestions
    }
  }

  async initialize(): Promise<void> {
    if (this.enabled) {
      console.log(`🔌 ${this.name} already enabled, skipping initialization`)
      return
    }

    console.log(`🔌 Initializing ${this.name} v${this.version} [${this.instanceId}]`)

    try {
      // Register completion provider for ESM imports
      const completionProvider = monaco.languages.registerCompletionItemProvider(
        ['typescript', 'javascript', 'javascriptreact'],
        {
          triggerCharacters: ['"', "'", '/'],
          provideCompletionItems: async (model, position) => {
            return this.provideImportCompletions(model, position)
          }
        }
      )
      this.disposables.push(completionProvider)
      console.log(`✅ Registered completion provider for ${this.name} [${this.instanceId}]`)

      // Register hover provider for import information
      const hoverProvider = monaco.languages.registerHoverProvider(
        ['typescript', 'javascript', 'javascriptreact'],
        {
          provideHover: async (model, position) => {
            return this.provideImportHover(model, position)
          }
        }
      )
      this.disposables.push(hoverProvider)
      console.log(`✅ Registered hover provider for ${this.name}`)

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
      console.log(`✅ Registered code action provider for ${this.name}`)

      // Configure TypeScript compiler options for ESM support
      this.configureCompilerOptions()

      // Listen for model content changes to update import analysis
      // We'll set this up when models are created, not globally
      // For now, we'll analyze imports when the plugin is initialized

      this.enabled = true
      console.log(`✅ ${this.name} [${this.instanceId}] initialized successfully`)
    } catch (error) {
      console.error(`❌ Failed to initialize ${this.name}:`, error)
      throw error
    }
  }

  dispose(): void {
    console.log(`🔌 Disposing ${this.name} [${this.instanceId}]`)

    this.disposables.forEach(disposable => disposable.dispose())
    this.disposables = []
    this.enabled = false

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
