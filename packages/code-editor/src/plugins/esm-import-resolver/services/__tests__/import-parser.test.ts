import { describe, it, expect, beforeEach } from 'vitest'
import { ImportParser } from '../import-parser'

describe('ImportParser', () => {
  let parser: ImportParser

  beforeEach(() => {
    parser = new ImportParser()
  })

  describe('parseImports', () => {
    it('should parse standard ES6 imports', async () => {
      const code = `
        import React from 'react'
        import { useState, useEffect } from 'react'
        import * as lodash from 'lodash'
        import { debounce } from 'lodash/debounce'
      `
      
      const imports = await parser.parseImports(code, 'test.ts')
      
      expect(imports).toHaveLength(4)
      
      // Default import
      expect(imports[0]).toMatchObject({
        source: 'react',
        specifiers: [{ type: 'default', local: 'React' }],
        isThirdParty: true,
        isNodeBuiltin: false
      })
      
      // Named imports
      expect(imports[1]).toMatchObject({
        source: 'react',
        specifiers: [
          { type: 'named', imported: 'useState', local: 'useState' },
          { type: 'named', imported: 'useEffect', local: 'useEffect' }
        ]
      })
      
      // Namespace import
      expect(imports[2]).toMatchObject({
        source: 'lodash',
        specifiers: [{ type: 'namespace', local: 'lodash' }]
      })
    })

    it('should handle relative imports', async () => {
      const code = `
        import { helper } from './utils'
        import config from '../config'
        import { Component } from '../../components/Component'
      `
      
      const imports = await parser.parseImports(code, 'test.ts')
      
      expect(imports).toHaveLength(3)
      imports.forEach(imp => {
        expect(imp.isThirdParty).toBe(false)
        expect(imp.resolved).toBe(imp.source) // Relative imports should remain unchanged
      })
    })

    it('should handle Node.js builtin modules', async () => {
      const code = `
        import fs from 'fs'
        import path from 'path'
        import { createHash } from 'crypto'
        import process from 'node:process'
      `
      
      const imports = await parser.parseImports(code, 'test.ts')
      
      expect(imports).toHaveLength(4)
      imports.forEach(imp => {
        expect(imp.isNodeBuiltin).toBe(true)
        expect(imp.resolved).toMatch(/^https:\/\/esm\.sh\//)
      })
    })

    it('should handle scoped packages', async () => {
      const code = `
        import { Excalidraw } from '@excalidraw/excalidraw'
        import babel from '@babel/core'
      `
      
      const imports = await parser.parseImports(code, 'test.ts')
      
      expect(imports).toHaveLength(2)
      imports.forEach(imp => {
        expect(imp.isThirdParty).toBe(true)
        expect(imp.resolved).toMatch(/^https:\/\/esm\.sh\/@/)
      })
    })

    it('should handle empty or invalid code gracefully', async () => {
      const emptyImports = await parser.parseImports('', 'test.ts')
      expect(emptyImports).toHaveLength(0)
      
      const invalidImports = await parser.parseImports('invalid syntax {', 'test.ts')
      expect(invalidImports).toHaveLength(0)
    })
  })

  describe('resolveImportUrl', () => {
    it('should resolve third-party packages to esm.sh URLs', () => {
      expect(parser.resolveImportUrl('react')).toBe('https://esm.sh/react')
      expect(parser.resolveImportUrl('@babel/core')).toBe('https://esm.sh/@babel/core')
      expect(parser.resolveImportUrl('lodash@4.17.21')).toBe('https://esm.sh/lodash@4.17.21')
    })

    it('should resolve Node.js builtins to esm.sh URLs', () => {
      expect(parser.resolveImportUrl('fs')).toBe('https://esm.sh/fs')
      expect(parser.resolveImportUrl('path')).toBe('https://esm.sh/path')
      expect(parser.resolveImportUrl('node:crypto')).toBe('https://esm.sh/crypto')
    })

    it('should leave relative imports unchanged', () => {
      expect(parser.resolveImportUrl('./utils')).toBe('./utils')
      expect(parser.resolveImportUrl('../config')).toBe('../config')
      expect(parser.resolveImportUrl('../../components')).toBe('../../components')
    })
  })

  describe('isThirdPartyPackage', () => {
    it('should identify third-party packages correctly', () => {
      expect(parser.isThirdPartyPackage('react')).toBe(true)
      expect(parser.isThirdPartyPackage('@babel/core')).toBe(true)
      expect(parser.isThirdPartyPackage('lodash')).toBe(true)
      expect(parser.isThirdPartyPackage('some-package')).toBe(true)
    })

    it('should not identify relative imports as third-party', () => {
      expect(parser.isThirdPartyPackage('./utils')).toBe(false)
      expect(parser.isThirdPartyPackage('../config')).toBe(false)
      expect(parser.isThirdPartyPackage('../../components')).toBe(false)
    })

    it('should not identify Node.js builtins as third-party', () => {
      expect(parser.isThirdPartyPackage('fs')).toBe(false)
      expect(parser.isThirdPartyPackage('path')).toBe(false)
      expect(parser.isThirdPartyPackage('crypto')).toBe(false)
    })

    it('should not identify empty strings as third-party', () => {
      expect(parser.isThirdPartyPackage('')).toBe(false)
      expect(parser.isThirdPartyPackage('   ')).toBe(false)
      expect(parser.isThirdPartyPackage('\t\n')).toBe(false)
    })
  })

  describe('isNodeBuiltin', () => {
    it('should identify Node.js builtin modules', () => {
      expect(parser.isNodeBuiltin('fs')).toBe(true)
      expect(parser.isNodeBuiltin('path')).toBe(true)
      expect(parser.isNodeBuiltin('crypto')).toBe(true)
      expect(parser.isNodeBuiltin('http')).toBe(true)
      expect(parser.isNodeBuiltin('util')).toBe(true)
    })

    it('should handle node: prefix', () => {
      expect(parser.isNodeBuiltin('node:fs')).toBe(true)
      expect(parser.isNodeBuiltin('node:path')).toBe(true)
      expect(parser.isNodeBuiltin('node:crypto')).toBe(true)
    })

    it('should not identify third-party packages as builtins', () => {
      expect(parser.isNodeBuiltin('react')).toBe(false)
      expect(parser.isNodeBuiltin('lodash')).toBe(false)
      expect(parser.isNodeBuiltin('@babel/core')).toBe(false)
    })
  })

  describe('isRelativeImport', () => {
    it('should identify relative imports', () => {
      expect(parser.isRelativeImport('./utils')).toBe(true)
      expect(parser.isRelativeImport('../config')).toBe(true)
      expect(parser.isRelativeImport('../../components')).toBe(true)
    })

    it('should not identify absolute or package imports as relative', () => {
      expect(parser.isRelativeImport('react')).toBe(false)
      expect(parser.isRelativeImport('@babel/core')).toBe(false)
      expect(parser.isRelativeImport('/absolute/path')).toBe(false)
    })
  })

  describe('extractPackageName', () => {
    it('should extract package names from simple imports', () => {
      expect(parser.extractPackageName('react')).toBe('react')
      expect(parser.extractPackageName('lodash')).toBe('lodash')
    })

    it('should extract package names from scoped packages', () => {
      expect(parser.extractPackageName('@babel/core')).toBe('@babel/core')
      expect(parser.extractPackageName('@excalidraw/excalidraw')).toBe('@excalidraw/excalidraw')
    })

    it('should extract package names from subpath imports', () => {
      expect(parser.extractPackageName('lodash/debounce')).toBe('lodash')
      expect(parser.extractPackageName('@babel/core/lib/transform')).toBe('@babel/core')
    })

    it('should handle version specifications', () => {
      expect(parser.extractPackageName('react@18.0.0')).toBe('react')
      expect(parser.extractPackageName('@babel/core@7.20.0')).toBe('@babel/core')
    })
  })

  describe('extractVersion', () => {
    it('should extract versions when specified', () => {
      expect(parser.extractVersion('react@18.0.0')).toBe('18.0.0')
      expect(parser.extractVersion('lodash@4.17.21')).toBe('4.17.21')
      expect(parser.extractVersion('@babel/core@7.20.0')).toBe('7.20.0')
    })

    it('should return undefined when no version specified', () => {
      expect(parser.extractVersion('react')).toBeUndefined()
      expect(parser.extractVersion('@babel/core')).toBeUndefined()
      expect(parser.extractVersion('lodash')).toBeUndefined()
    })
  })
})
