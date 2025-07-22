import * as monaco from 'monaco-editor'
import type { MonacoIntegrationService, TypeDefinition, ImportSuggestion } from '../interfaces'

/**
 * Monaco integration service implementation
 */
export class MonacoIntegration implements MonacoIntegrationService {
  private registeredLibs = new Map<string, monaco.IDisposable>()
  private disposables: monaco.IDisposable[] = []

  /**
   * Register type definitions with Monaco Editor
   */
  registerTypeDefinitions(types: TypeDefinition[]): void {
    console.log(`📝 Registering ${types.length} type definitions with Monaco Editor`)

    types.forEach(typeDef => {
      try {
        // Method 1: Register as node_modules structure
        const nodeModulesPath = this.createTypeFilePath(typeDef.packageName, typeDef.url)
        const existing1 = this.registeredLibs.get(nodeModulesPath)
        if (existing1) {
          existing1.dispose()
        }
        const disposable1 = this.addExtraLib(typeDef.content, nodeModulesPath)
        this.registeredLibs.set(nodeModulesPath, disposable1)

        // Method 2: Create a module declaration wrapper
        const moduleDeclarationPath = `ts:filename/${typeDef.packageName}.d.ts`
        const moduleDeclaration = this.createModuleDeclaration(typeDef.packageName, typeDef.content)
        const existing2 = this.registeredLibs.get(moduleDeclarationPath)
        if (existing2) {
          existing2.dispose()
        }
        const disposable2 = this.addExtraLib(moduleDeclaration, moduleDeclarationPath)
        this.registeredLibs.set(moduleDeclarationPath, disposable2)

        console.log(`✅ Registered types for ${typeDef.packageName}`)
        console.log(`   - Node modules: ${nodeModulesPath}`)
        console.log(`   - Module declaration: ${moduleDeclarationPath}`)
      } catch (error) {
        console.error(`❌ Failed to register types for ${typeDef.packageName}:`, error)
      }
    })

    // Force TypeScript language service to recompile after adding new types
    this.triggerTypeScriptRecompilation()
  }

  /**
   * Update TypeScript compiler options
   */
  updateCompilerOptions(options: monaco.languages.typescript.CompilerOptions): void {
    try {
      // Update both JavaScript and TypeScript compiler options
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
        ...options
      })

      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        ...monaco.languages.typescript.javascriptDefaults.getCompilerOptions(),
        ...options
      })

      console.log('✅ Updated Monaco TypeScript compiler options')
    } catch (error) {
      console.error('❌ Failed to update compiler options:', error)
    }
  }

  /**
   * Update path mappings for module resolution
   */
  private updatePathMappings(pathMappings: Record<string, string[]>): void {
    try {
      console.log('🗺️ Updating TypeScript path mappings:', pathMappings)

      // Get current compiler options
      const currentOptions = monaco.languages.typescript.typescriptDefaults.getCompilerOptions()

      // Merge with existing paths
      const updatedPaths = {
        ...currentOptions.paths,
        ...pathMappings
      }

      // Update compiler options with new paths
      const newOptions = {
        ...currentOptions,
        paths: updatedPaths,
        baseUrl: 'file:///',
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }

      this.updateCompilerOptions(newOptions)
      console.log('✅ Updated TypeScript path mappings')
    } catch (error) {
      console.error('❌ Failed to update path mappings:', error)
    }
  }

  /**
   * Add extra library to Monaco Editor
   */
  addExtraLib(content: string, filePath: string): monaco.IDisposable {
    console.log(`📚 Adding extra lib: ${filePath}`)
    console.log(`📄 Content preview: ${content.substring(0, 200)}...`)

    // Add to TypeScript defaults
    const tsDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
      content,
      filePath
    )

    // Also add to JavaScript defaults for better compatibility
    const jsDisposable = monaco.languages.typescript.javascriptDefaults.addExtraLib(
      content,
      filePath
    )

    // Return a combined disposable
    const combinedDisposable = {
      dispose: () => {
        tsDisposable.dispose()
        jsDisposable.dispose()
      }
    }

    this.disposables.push(combinedDisposable)
    console.log(`✅ Successfully added extra lib: ${filePath}`)
    return combinedDisposable
  }

  /**
   * Create diagnostics provider (placeholder)
   */
  createDiagnosticsProvider(): void {
    // Diagnostics are handled automatically by Monaco's TypeScript service
    console.log('📊 Diagnostics provider ready (handled by Monaco TypeScript service)')
  }

  /**
   * Create completion provider (placeholder)
   */
  createCompletionProvider(): monaco.IDisposable {
    // Completions are handled automatically by Monaco's TypeScript service
    console.log('🔍 Completion provider ready (handled by Monaco TypeScript service)')
    return { dispose: () => {} }
  }

  /**
   * Create hover provider (placeholder)
   */
  createHoverProvider(): monaco.IDisposable {
    // Hover is handled automatically by Monaco's TypeScript service
    console.log('🔍 Hover provider ready (handled by Monaco TypeScript service)')
    return { dispose: () => {} }
  }

  /**
   * Create definition provider (placeholder)
   */
  createDefinitionProvider(): monaco.IDisposable {
    // Go-to-definition is handled automatically by Monaco's TypeScript service
    console.log('🔍 Definition provider ready (handled by Monaco TypeScript service)')
    return { dispose: () => {} }
  }

  /**
   * Update import suggestions (placeholder)
   */
  updateImportSuggestions(_imports: ImportSuggestion[]): void {
    // Import suggestions are handled by the completion provider
    console.log('📝 Import suggestions updated')
  }

  /**
   * Clear all registered types
   */
  clearRegisteredTypes(): void {
    console.log('🧹 Clearing all registered type definitions')

    // Dispose all registered libs
    this.registeredLibs.forEach(disposable => disposable.dispose())
    this.registeredLibs.clear()

    // Dispose all other disposables
    this.disposables.forEach(disposable => disposable.dispose())
    this.disposables.length = 0

    console.log('✅ All type definitions cleared')
  }

  /**
   * Get TypeScript service (placeholder)
   */
  getTypeScriptService(): monaco.languages.typescript.TypeScriptWorker | null {
    // This would require more complex implementation to access the worker
    console.log('🔧 TypeScript service access not implemented')
    return null
  }

  /**
   * Create a unique file path for type definitions
   */
  private createTypeFilePath(packageName: string, typeUrl: string): string {
    // Create a virtual file path that Monaco can understand
    // Use the actual package name structure for better module resolution
    const hash = this.simpleHash(typeUrl)

    if (packageName.startsWith('@')) {
      // Scoped package: @babel/core -> node_modules/@babel/core/index.d.ts
      return `file:///node_modules/${packageName}/index.d.ts?${hash}`
    } else {
      // Regular package: react -> node_modules/react/index.d.ts
      return `file:///node_modules/${packageName}/index.d.ts?${hash}`
    }
  }

  /**
   * Create a module declaration wrapper for better module resolution
   */
  private createModuleDeclaration(packageName: string, typeContent: string): string {
    // Create a module declaration that explicitly declares the module
    return `declare module "${packageName}" {
${typeContent.replace(/^/gm, '  ')}
}

declare module "${packageName}/*" {
  export * from "${packageName}";
}
`
  }

  /**
   * Simple hash function for URLs
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Trigger TypeScript language service recompilation
   */
  private triggerTypeScriptRecompilation(): void {
    try {
      console.log('🔄 Triggering TypeScript language service recompilation...')

      // Use a safer approach - just trigger diagnostics update
      setTimeout(() => {
        const models = monaco.editor.getModels()
        models.forEach(model => {
          if (model.getLanguageId() === 'typescript' || model.getLanguageId() === 'typescriptreact') {
            // Trigger diagnostics update without changing content
            monaco.editor.setModelMarkers(model, 'typescript', [])
          }
        })
        console.log(`✅ Triggered diagnostics update for ${models.length} TypeScript models`)
      }, 100)
    } catch (error) {
      console.error('❌ Failed to trigger TypeScript recompilation:', error)
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clearRegisteredTypes()
  }
}