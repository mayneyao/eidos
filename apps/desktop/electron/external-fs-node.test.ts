import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { NodeExternalFileSystem } from './external-fs-node'

describe('NodeExternalFileSystem', () => {
    let tempDir: string
    let mountDir: string
    let projectRoot: string

    beforeEach(async () => {
        // Create temporary directories for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eidos-test-'))
        projectRoot = path.join(tempDir, 'project')
        mountDir = path.join(tempDir, 'mount')

        await fs.mkdir(projectRoot, { recursive: true })
        await fs.mkdir(mountDir, { recursive: true })
    })

    afterEach(async () => {
        // Clean up temporary directories
        await fs.rm(tempDir, { recursive: true, force: true })
    })

    describe('readdir', () => {
        it('should return file names when withFileTypes is false', async () => {
            // Create test files
            await fs.writeFile(path.join(projectRoot, 'file1.txt'), 'content1')
            await fs.writeFile(path.join(projectRoot, 'file2.txt'), 'content2')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const result = await fileSystem.readdir('~/')
            expect(result).toContain('file1.txt')
            expect(result).toContain('file2.txt')
        })

        it('should return IDirectoryEntry with virtual paths (~/) when withFileTypes is true', async () => {
            // Create test files and directories
            await fs.writeFile(path.join(projectRoot, 'file.txt'), 'content')
            await fs.mkdir(path.join(projectRoot, 'subdir'), { recursive: true })
            await fs.writeFile(path.join(projectRoot, 'subdir', 'nested.txt'), 'nested')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const result = await fileSystem.readdir('~/', { withFileTypes: true })

            // Check file entry
            const fileEntry = result.find(e => e.name === 'file.txt')
            expect(fileEntry).toBeDefined()
            expect(fileEntry?.kind).toBe('file')
            expect(fileEntry?.path).toBe('~/file.txt')
            expect(fileEntry?.parentPath).toBe('~/')

            // Check directory entry
            const dirEntry = result.find(e => e.name === 'subdir')
            expect(dirEntry).toBeDefined()
            expect(dirEntry?.kind).toBe('directory')
            expect(dirEntry?.path).toBe('~/subdir')
            expect(dirEntry?.parentPath).toBe('~/')
        })

        it.skip('should return IDirectoryEntry with virtual paths (@/) when reading mounted folder', async () => {
            // Create test files in mount directory
            await fs.writeFile(path.join(mountDir, 'song.mp3'), 'music content')
            await fs.mkdir(path.join(mountDir, 'playlist'), { recursive: true })

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('@/music')) {
                    if (fsPath === '@/music' || fsPath === '@/music/') {
                        return mountDir
                    }
                    const relativePath = fsPath.substring(8) // Remove '@/music/'
                    return path.join(mountDir, relativePath)
                }
                return null
            })

            const result = await fileSystem.readdir('@/music', { withFileTypes: true })

            // Check file entry
            const fileEntry = result.find(e => e.name === 'song.mp3')
            expect(fileEntry).toBeDefined()
            expect(fileEntry?.kind).toBe('file')
            expect(fileEntry?.path).toBe('@/music/song.mp3')
            expect(fileEntry?.parentPath).toBe('@/music')

            // Check directory entry
            const dirEntry = result.find(e => e.name === 'playlist')
            expect(dirEntry).toBeDefined()
            expect(dirEntry?.kind).toBe('directory')
            expect(dirEntry?.path).toBe('@/music/playlist')
            expect(dirEntry?.parentPath).toBe('@/music')
        })

    it.skip('should handle recursive directory reading', async () => {
      // Create nested structure
      await fs.mkdir(path.join(projectRoot, 'level1'), { recursive: true })
      await fs.mkdir(path.join(projectRoot, 'level1', 'level2'), { recursive: true })
      await fs.writeFile(path.join(projectRoot, 'level1', 'level2', 'deep.txt'), 'deep')

      const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
        if (fsPath.startsWith('~/')) {
          return path.join(projectRoot, fsPath.substring(2))
        }
        return null
      })

      const result = await fileSystem.readdir('~/', { withFileTypes: true, recursive: true })

      // Find nested file
      // In recursive mode, dirent.name is the relative path (e.g., "level1/level2/deep.txt")
      const deepFile = result.find(e => e.name === 'level1/level2/deep.txt')
      expect(deepFile).toBeDefined()
      expect(deepFile?.path).toBe('~/level1/level2/deep.txt')
      expect(deepFile?.parentPath).toBe('~/level1/level2')
    })

        it('should handle paths with trailing slash', async () => {
            await fs.writeFile(path.join(projectRoot, 'file.txt'), 'content')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const result = await fileSystem.readdir('~/', { withFileTypes: true })
            const fileEntry = result.find(e => e.name === 'file.txt')
            expect(fileEntry?.path).toBe('~/file.txt')
        })

    it('should handle paths without trailing slash', async () => {
      await fs.writeFile(path.join(mountDir, 'file.txt'), 'content')

      const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
        if (fsPath.startsWith('@/music')) {
          const relativePath = fsPath.substring(7) // Remove '@/music'
          return relativePath ? path.join(mountDir, relativePath) : mountDir
        }
        return null
      })

      const result = await fileSystem.readdir('@/music', { withFileTypes: true })
      const fileEntry = result.find(e => e.name === 'file.txt')
      expect(fileEntry?.path).toBe('@/music/file.txt')
    })

    it('should normalize ~ to ~/ consistently', async () => {
      await fs.writeFile(path.join(projectRoot, 'file.txt'), 'content')

      const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
        if (fsPath.startsWith('~/')) {
          return path.join(projectRoot, fsPath.substring(2))
        }
        return null
      })

      // Test both '~' and '~/' should produce same results
      const result1 = await fileSystem.readdir('~', { withFileTypes: true })
      const result2 = await fileSystem.readdir('~/', { withFileTypes: true })

      expect(result1).toEqual(result2)
      
      // Both should have consistent paths
      const fileEntry1 = result1.find(e => e.name === 'file.txt')
      const fileEntry2 = result2.find(e => e.name === 'file.txt')
      
      expect(fileEntry1?.path).toBe('~/file.txt')
      expect(fileEntry2?.path).toBe('~/file.txt')
      expect(fileEntry1?.parentPath).toBe('~/')
      expect(fileEntry2?.parentPath).toBe('~/')
    })

    it('should throw error when path cannot be resolved', async () => {
      const fileSystem = new NodeExternalFileSystem(async () => null)

      await expect(fileSystem.readdir('~/nonexistent')).rejects.toThrow('Cannot resolve path: ~/nonexistent')
    })
  })

  describe('mkdir', () => {
        it('should create directory in mounted folder', async () => {
            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('@/music/')) {
                    const relativePath = fsPath.substring(7)
                    return path.join(mountDir, relativePath)
                } else if (fsPath === '@/music') {
                    return mountDir
                }
                return null
            })

            await fileSystem.mkdir('@/music/newfolder')

            const stats = await fs.stat(path.join(mountDir, 'newfolder'))
            expect(stats.isDirectory()).toBe(true)
        })

        it('should create nested directories with recursive option', async () => {
            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('@/music/')) {
                    const relativePath = fsPath.substring(7)
                    return path.join(mountDir, relativePath)
                }
                return null
            })

            await fileSystem.mkdir('@/music/nested/deep/folder', { recursive: true })

            const stats = await fs.stat(path.join(mountDir, 'nested', 'deep', 'folder'))
            expect(stats.isDirectory()).toBe(true)
        })

        it('should allow creating directories in project folder', async () => {
            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            await fileSystem.mkdir('~/newprojectfolder')

            const stats = await fs.stat(path.join(projectRoot, 'newprojectfolder'))
            expect(stats.isDirectory()).toBe(true)
        })

        it('should throw error when path cannot be resolved', async () => {
            const fileSystem = new NodeExternalFileSystem(async () => null)

            await expect(fileSystem.mkdir('@/nonexistent/folder')).rejects.toThrow('Cannot resolve path: @/nonexistent/folder')
        })
    })

    describe('direntToEntry path conversion', () => {
    it.skip('should convert absolute paths to virtual paths correctly', async () => {
      // Create a file in a subdirectory
      await fs.mkdir(path.join(projectRoot, 'subdir'), { recursive: true })
      await fs.writeFile(path.join(projectRoot, 'subdir', 'file.txt'), 'content')

      const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
        if (fsPath.startsWith('~/')) {
          return path.join(projectRoot, fsPath.substring(2))
        }
        return null
      })

      const result = await fileSystem.readdir('~/', { withFileTypes: true, recursive: true })

      // Find the nested file
      // In recursive mode, dirent.name is the relative path (e.g., "subdir/file.txt")
      const nestedFile = result.find(e => e.path === '~/subdir/file.txt')
      expect(nestedFile).toBeDefined()
      expect(nestedFile?.name).toBe('subdir/file.txt') // In recursive mode, name is relative path
      expect(nestedFile?.parentPath).toBe('~/subdir')
    })

        it('should handle Windows-style paths correctly (backslashes)', async () => {
            // This test ensures that backslashes are converted to forward slashes
            // We'll simulate this by using path.join which may produce backslashes on Windows
            await fs.writeFile(path.join(projectRoot, 'file.txt'), 'content')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const result = await fileSystem.readdir('~/', { withFileTypes: true })
            const fileEntry = result.find(e => e.name === 'file.txt')

            // Path should always use forward slashes regardless of platform
            expect(fileEntry?.path).toBe('~/file.txt')
            expect(fileEntry?.path).not.toContain('\\')
        })

        it('should return correct parentPath for root directory files', async () => {
            await fs.writeFile(path.join(projectRoot, 'rootfile.txt'), 'content')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const result = await fileSystem.readdir('~/', { withFileTypes: true })
            const fileEntry = result.find(e => e.name === 'rootfile.txt')

            expect(fileEntry?.parentPath).toBe('~/')
        })
    })
})

