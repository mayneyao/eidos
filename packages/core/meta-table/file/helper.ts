/**
 * Helper utilities for file path operations
 */

export class PathHelper {
  static readonly ROOT_DIR = 'files'

  /**
   * Normalize path by removing empty segments
   * @param path Path string to normalize
   * @returns Normalized path
   */
  static normalize(path: string): string {
    return path.split('/').filter(Boolean).join('/')
  }

  /**
   * Join path parts into a single path
   * @param parts Path segments to join
   * @returns Joined path
   */
  static join(...parts: string[]): string {
    return parts.filter(Boolean).join('/')
  }

  /**
   * Convert path string to array of segments
   * @param path Path string
   * @returns Array of path segments
   */
  static toArray(path: string): string[] {
    return path.split('/').filter(Boolean)
  }

  /**
   * Check if path is an external path (starts with /@/)
   * @param path Path to check
   * @returns True if external path
   */
  static isExternalPath(path: string): boolean {
    return path.startsWith('/@/')
  }

  /**
   * Parse external path to extract folder name and relative path
   * @param path External path starting with /@/
   * @returns Object with folderName and relativePath
   */
  static parseExternalPath(path: string): {
    folderName: string
    relativePath: string[]
  } {
    const parts = decodeURIComponent(path).split('/').filter(Boolean)
    return {
      folderName: parts[1], // After /@/
      relativePath: parts.slice(2)
    }
  }
}

