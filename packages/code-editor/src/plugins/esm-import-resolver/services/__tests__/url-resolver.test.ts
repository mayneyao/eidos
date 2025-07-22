import { describe, it, expect, beforeEach } from 'vitest'
import { URLResolver } from '../url-resolver'

describe('URLResolver', () => {
  let resolver: URLResolver

  beforeEach(() => {
    resolver = new URLResolver()
  })

  describe('resolvePackageUrl', () => {
    it('should resolve simple packages to esm.sh URLs', () => {
      expect(resolver.resolvePackageUrl('react')).toBe('https://esm.sh/react')
      expect(resolver.resolvePackageUrl('lodash')).toBe('https://esm.sh/lodash')
    })

    it('should resolve scoped packages correctly', () => {
      expect(resolver.resolvePackageUrl('@babel/core')).toBe('https://esm.sh/@babel/core')
      expect(resolver.resolvePackageUrl('@excalidraw/excalidraw')).toBe('https://esm.sh/@excalidraw/excalidraw')
    })

    it('should handle version specifications', () => {
      expect(resolver.resolvePackageUrl('react@18.0.0')).toBe('https://esm.sh/react@18.0.0')
      expect(resolver.resolvePackageUrl('@babel/core@7.20.0')).toBe('https://esm.sh/@babel/core@7.20.0')
    })

    it('should handle subpath imports', () => {
      expect(resolver.resolvePackageUrl('lodash/debounce')).toBe('https://esm.sh/lodash/debounce')
      expect(resolver.resolvePackageUrl('@babel/core/lib/transform')).toBe('https://esm.sh/@babel/core/lib/transform')
    })

    it('should handle Node.js builtin modules', () => {
      expect(resolver.resolvePackageUrl('fs')).toBe('https://esm.sh/fs')
      expect(resolver.resolvePackageUrl('path')).toBe('https://esm.sh/path')
      expect(resolver.resolvePackageUrl('node:crypto')).toBe('https://esm.sh/crypto')
    })

    it('should leave relative imports unchanged', () => {
      expect(resolver.resolvePackageUrl('./utils')).toBe('./utils')
      expect(resolver.resolvePackageUrl('../config')).toBe('../config')
      expect(resolver.resolvePackageUrl('../../components')).toBe('../../components')
    })

    it('should handle resolve options', () => {
      // Target environment
      expect(resolver.resolvePackageUrl('react', { target: 'deno' }))
        .toBe('https://esm.sh/react?target=deno')
      
      // Version override
      expect(resolver.resolvePackageUrl('react', { version: '17.0.0' }))
        .toBe('https://esm.sh/react@17.0.0')
      
      // No types
      expect(resolver.resolvePackageUrl('react', { noDts: true }))
        .toBe('https://esm.sh/react?no-dts=true')
      
      // Development mode
      expect(resolver.resolvePackageUrl('react', { dev: true }))
        .toBe('https://esm.sh/react?dev=true')
      
      // Bundle format
      expect(resolver.resolvePackageUrl('react', { format: 'cjs' }))
        .toBe('https://esm.sh/react?bundle=cjs')
      
      // Multiple options
      expect(resolver.resolvePackageUrl('react', { 
        target: 'deno', 
        version: '18.0.0',
        noDts: true 
      })).toBe('https://esm.sh/react@18.0.0?target=deno&no-dts=true')
    })

    it('should handle custom query parameters', () => {
      expect(resolver.resolvePackageUrl('react', {
        queryParams: { 'custom-param': 'value', 'another': 'test' }
      })).toBe('https://esm.sh/react?custom-param=value&another=test')
    })
  })

  describe('shouldResolve', () => {
    it('should resolve third-party packages by default', () => {
      expect(resolver.shouldResolve('react')).toBe(true)
      expect(resolver.shouldResolve('@babel/core')).toBe(true)
      expect(resolver.shouldResolve('lodash')).toBe(true)
    })

    it('should not resolve relative imports', () => {
      expect(resolver.shouldResolve('./utils')).toBe(false)
      expect(resolver.shouldResolve('../config')).toBe(false)
      expect(resolver.shouldResolve('../../components')).toBe(false)
    })

    it('should respect blacklist', () => {
      resolver.addToBlacklist('react')
      expect(resolver.shouldResolve('react')).toBe(false)
      expect(resolver.shouldResolve('lodash')).toBe(true)
    })

    it('should respect whitelist when set', () => {
      resolver.addToWhitelist('react')
      resolver.addToWhitelist('lodash')
      
      expect(resolver.shouldResolve('react')).toBe(true)
      expect(resolver.shouldResolve('lodash')).toBe(true)
      expect(resolver.shouldResolve('@babel/core')).toBe(false)
    })

    it('should prioritize blacklist over whitelist', () => {
      resolver.addToWhitelist('react')
      resolver.addToBlacklist('react')
      
      expect(resolver.shouldResolve('react')).toBe(false)
    })
  })

  describe('getPackageMetadata', () => {
    it('should parse simple package names', () => {
      const metadata = resolver.getPackageMetadata('react')
      expect(metadata).toMatchObject({
        originalPath: 'react',
        name: 'react',
        isScoped: false,
        isNodeBuiltin: false,
        isRelative: false
      })
    })

    it('should parse scoped packages', () => {
      const metadata = resolver.getPackageMetadata('@babel/core')
      expect(metadata).toMatchObject({
        originalPath: '@babel/core',
        name: '@babel/core',
        scope: 'babel',
        isScoped: true,
        isNodeBuiltin: false,
        isRelative: false
      })
    })

    it('should parse packages with subpaths', () => {
      const metadata = resolver.getPackageMetadata('lodash/debounce')
      expect(metadata).toMatchObject({
        originalPath: 'lodash/debounce',
        name: 'lodash',
        subpath: '/debounce',
        isScoped: false
      })
      
      const scopedMetadata = resolver.getPackageMetadata('@babel/core/lib/transform')
      expect(scopedMetadata).toMatchObject({
        originalPath: '@babel/core/lib/transform',
        name: '@babel/core',
        subpath: '/lib/transform',
        isScoped: true
      })
    })

    it('should parse packages with versions', () => {
      const metadata = resolver.getPackageMetadata('react@18.0.0')
      expect(metadata).toMatchObject({
        originalPath: 'react@18.0.0',
        name: 'react',
        version: '18.0.0',
        isScoped: false
      })
      
      const scopedMetadata = resolver.getPackageMetadata('@babel/core@7.20.0')
      expect(scopedMetadata).toMatchObject({
        originalPath: '@babel/core@7.20.0',
        name: '@babel/core',
        version: '7.20.0',
        isScoped: true
      })
    })

    it('should identify Node.js builtins', () => {
      const metadata = resolver.getPackageMetadata('fs')
      expect(metadata.isNodeBuiltin).toBe(true)
      
      const nodeMetadata = resolver.getPackageMetadata('node:crypto')
      expect(nodeMetadata.isNodeBuiltin).toBe(true)
      expect(nodeMetadata.name).toBe('crypto')
    })

    it('should identify relative imports', () => {
      const metadata = resolver.getPackageMetadata('./utils')
      expect(metadata).toMatchObject({
        originalPath: './utils',
        name: './utils',
        isRelative: true
      })
    })
  })

  describe('configuration', () => {
    it('should allow setting custom ESM server URL', () => {
      resolver.setEsmServerUrl('https://cdn.skypack.dev')
      expect(resolver.resolvePackageUrl('react')).toBe('https://cdn.skypack.dev/react')
    })

    it('should handle ESM server URL with trailing slash', () => {
      resolver.setEsmServerUrl('https://cdn.skypack.dev/')
      expect(resolver.resolvePackageUrl('react')).toBe('https://cdn.skypack.dev/react')
    })

    it('should manage whitelist correctly', () => {
      resolver.addToWhitelist('react')
      resolver.addToWhitelist('lodash')
      
      expect(resolver.getWhitelist()).toEqual(['react', 'lodash'])
      
      resolver.clearWhitelist()
      expect(resolver.getWhitelist()).toEqual([])
    })

    it('should manage blacklist correctly', () => {
      resolver.addToBlacklist('react')
      resolver.addToBlacklist('lodash')
      
      expect(resolver.getBlacklist()).toEqual(['react', 'lodash'])
      
      resolver.clearBlacklist()
      expect(resolver.getBlacklist()).toEqual([])
    })
  })
})
