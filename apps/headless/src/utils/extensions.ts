/**
 * SQLite extensions utility for headless server
 * Adapted from apps/cli/src/utils/extensions.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Get platform-specific library extension
 */
export function getLibExtension(): string {
  switch (process.platform) {
    case 'darwin':
      return 'dylib'
    case 'win32':
      return 'dll'
    default:
      return 'so'
  }
}

/**
 * Get the path to SQLite extensions directory
 * Checks multiple possible locations
 */
export function getExtensionsDir(): string | null {
  const ext = getLibExtension()
  
  // Check environment variable first
  if (process.env.SQLITE_EXTENSIONS_DIR) {
    const envDir = process.env.SQLITE_EXTENSIONS_DIR
    if (fs.existsSync(envDir) && fs.existsSync(path.join(envDir, `libsimple.${ext}`))) {
      return envDir
    }
  }
  
  // List of possible locations to check
  const possiblePaths = [
    // Built by postinstall script (same as desktop pattern)
    path.resolve(process.cwd(), 'dist-sqlite-ext'),
    // Docker: /app/extensions
    '/app/extensions',
    // Alternative naming
    path.resolve(process.cwd(), 'extensions'),
    // Development: relative to headless package
    path.resolve(__dirname, '../../dist-sqlite-ext'),
    path.resolve(__dirname, '../../../desktop/dist-sqlite-ext'),
    // Next to the executable
    path.resolve(path.dirname(process.execPath), 'dist-sqlite-ext'),
  ]
  
  for (const extPath of possiblePaths) {
    if (fs.existsSync(extPath)) {
      // Verify at least one extension exists
      const simpleLib = path.join(extPath, `libsimple.${ext}`)
      if (fs.existsSync(simpleLib)) {
        return extPath
      }
    }
  }
  
  return null
}

export interface ExtensionPaths {
  simple?: {
    libPath: string
    dictPath: string
  }
  vec?: {
    libPath: string
  }
  graft?: {
    libPath: string
  }
}

/**
 * Get extension library paths
 */
export function getExtensionPaths(): ExtensionPaths {
  const extDir = getExtensionsDir()
  
  if (!extDir) {
    console.warn('[Extensions] SQLite extensions directory not found')
    return {}
  }
  
  const ext = getLibExtension()
  const paths: ExtensionPaths = {}
  
  // Check each extension
  const simplePath = path.join(extDir, `libsimple.${ext}`)
  const dictPath = path.join(extDir, 'dict')
  if (fs.existsSync(simplePath)) {
    paths.simple = {
      libPath: simplePath,
      dictPath: fs.existsSync(dictPath) ? dictPath : extDir,
    }
    console.log(`[Extensions] Found libsimple: ${simplePath}`)
  }
  
  const vecPath = path.join(extDir, `libvec.${ext}`)
  if (fs.existsSync(vecPath)) {
    paths.vec = { libPath: vecPath }
    console.log(`[Extensions] Found libvec: ${vecPath}`)
  }
  
  const graftPath = path.join(extDir, `libgraft.${ext}`)
  if (fs.existsSync(graftPath)) {
    paths.graft = { libPath: graftPath }
    console.log(`[Extensions] Found libgraft: ${graftPath}`)
  }
  
  return paths
}

/**
 * Validate that required extensions exist
 */
export function validateExtensions(): { 
  valid: boolean
  found: string[]
  missing: string[] 
} {
  const extDir = getExtensionsDir()
  
  if (!extDir) {
    return {
      valid: false,
      found: [],
      missing: ['Extensions directory not found'],
    }
  }
  
  const ext = getLibExtension()
  const found: string[] = []
  const missing: string[] = []
  
  const requiredExtensions = [
    { name: 'libsimple', path: `libsimple.${ext}` },
    { name: 'dict', path: 'dict' },
  ]
  
  const optionalExtensions = [
    { name: 'libvec', path: `libvec.${ext}` },
    { name: 'libgraft', path: `libgraft.${ext}` },
  ]
  
  for (const e of requiredExtensions) {
    const fullPath = path.join(extDir, e.path)
    if (fs.existsSync(fullPath)) {
      found.push(e.name)
    } else {
      missing.push(e.name)
    }
  }
  
  for (const e of optionalExtensions) {
    const fullPath = path.join(extDir, e.path)
    if (fs.existsSync(fullPath)) {
      found.push(e.name)
    }
  }
  
  return {
    valid: missing.length === 0,
    found,
    missing,
  }
}
