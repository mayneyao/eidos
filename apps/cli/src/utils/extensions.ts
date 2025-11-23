import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the actual executable path, resolving symlinks
 */
function getExecutablePath(): string {
  let execPath = process.execPath;
  
  // Resolve symlinks
  try {
    while (fs.lstatSync(execPath).isSymbolicLink()) {
      execPath = fs.readlinkSync(execPath);
      // Handle relative symlinks
      if (!path.isAbsolute(execPath)) {
        execPath = path.resolve(path.dirname(process.execPath), execPath);
      }
    }
  } catch (error) {
    // If we can't resolve, use as-is
  }
  
  return execPath;
}

/**
 * Get the path to SQLite extensions directory
 * Supports both development and production modes
 */
export function getExtensionsDir(): string {
  const execPath = getExecutablePath();
  const execDir = path.dirname(execPath);
  
  // List of possible locations to check
  const possiblePaths = [
    // Next to the executable (production)
    path.join(execDir, 'dist-sqlite-ext'),
    // In parent directory (if executable is in dist/)
    path.join(execDir, '../dist-sqlite-ext'),
    // Development mode - desktop app extensions
    path.resolve(__dirname, '../../../desktop/dist-sqlite-ext'),
    // Development mode - CLI's own extensions
    path.resolve(process.cwd(), 'dist-sqlite-ext'),
  ];

  for (const extPath of possiblePaths) {
    if (fs.existsSync(extPath)) {
      return extPath;
    }
  }

  throw new Error(
    'SQLite extensions not found. Please ensure dist-sqlite-ext directory exists.'
  );
}

/**
 * Get platform-specific library extension
 */
export function getLibExtension(): string {
  switch (process.platform) {
    case 'darwin':
      return 'dylib';
    case 'win32':
      return 'dll';
    default:
      return 'so';
  }
}

/**
 * Get extension library paths
 */
export function getExtensionPaths() {
  const extDir = getExtensionsDir();
  const ext = getLibExtension();

  return {
    simple: {
      libPath: path.join(extDir, `libsimple.${ext}`),
      dictPath: path.join(extDir, 'dict'),
    },
    vec: {
      libPath: path.join(extDir, `libvec.${ext}`),
    },
    graft: {
      libPath: path.join(extDir, `libgraft.${ext}`),
    },
  };
}

/**
 * Validate that all required extensions exist
 */
export function validateExtensions(): { valid: boolean; missing: string[] } {
  try {
    const paths = getExtensionPaths();
    const missing: string[] = [];

    if (!fs.existsSync(paths.simple.libPath)) {
      missing.push(paths.simple.libPath);
    }
    if (!fs.existsSync(paths.simple.dictPath)) {
      missing.push(paths.simple.dictPath);
    }
    if (!fs.existsSync(paths.vec.libPath)) {
      missing.push(paths.vec.libPath);
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  } catch (error) {
    return {
      valid: false,
      missing: ['Extensions directory not found'],
    };
  }
}

