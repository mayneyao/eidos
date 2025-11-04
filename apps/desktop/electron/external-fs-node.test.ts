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

    describe('readFile', () => {
        it('should read text file with encoding', async () => {
            const content = 'Hello, World!'
            await fs.writeFile(path.join(projectRoot, 'hello.txt'), content, 'utf8')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const result = await fileSystem.readFile('~/hello.txt', 'utf8')
            expect(result).toBe(content)
            expect(typeof result).toBe('string')
        })

        it('should read text file with encoding options object', async () => {
            const content = 'Test content'
            await fs.writeFile(path.join(projectRoot, 'test.txt'), content, 'utf8')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const result = await fileSystem.readFile('~/test.txt', { encoding: 'utf8' })
            expect(result).toBe(content)
            expect(typeof result).toBe('string')
        })

        it('should read binary file as Uint8Array', async () => {
            const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
            await fs.writeFile(path.join(projectRoot, 'image.png'), binaryData)

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const result = await fileSystem.readFile('~/image.png')
            expect(result).toBeInstanceOf(Uint8Array)
            expect(Array.from(result)).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        })

        it('should read file from mounted folder', async () => {
            const content = 'Mounted file content'
            await fs.writeFile(path.join(mountDir, 'data.txt'), content, 'utf8')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('@/music')) {
                    const relativePath = fsPath.substring(7)
                    return relativePath ? path.join(mountDir, relativePath) : mountDir
                }
                return null
            })

            const result = await fileSystem.readFile('@/music/data.txt', 'utf8')
            expect(result).toBe(content)
        })

        it('should throw error when file does not exist', async () => {
            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            await expect(fileSystem.readFile('~/nonexistent.txt', 'utf8')).rejects.toThrow()
        })

        it('should throw error when path cannot be resolved', async () => {
            const fileSystem = new NodeExternalFileSystem(async () => null)

            await expect(fileSystem.readFile('~/test.txt', 'utf8')).rejects.toThrow('Cannot resolve path: ~/test.txt')
        })
    })

    describe('writeFile', () => {
        it('should write text file with string data', async () => {
            const content = 'Hello, World!'

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            await fileSystem.writeFile('~/hello.txt', content)

            const readContent = await fs.readFile(path.join(projectRoot, 'hello.txt'), 'utf8')
            expect(readContent).toBe(content)
        })

        it('should write text file with encoding', async () => {
            const content = 'Test content with encoding'

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            await fileSystem.writeFile('~/test.txt', content, 'utf8')

            const readContent = await fs.readFile(path.join(projectRoot, 'test.txt'), 'utf8')
            expect(readContent).toBe(content)
        })

        it('should write binary file with Uint8Array', async () => {
            const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            await fileSystem.writeFile('~/image.png', binaryData)

            const readData = await fs.readFile(path.join(projectRoot, 'image.png'))
            expect(Array.from(readData)).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        })

        it('should write file with options', async () => {
            const content = 'Content with options'

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            await fileSystem.writeFile('~/options.txt', content, { encoding: 'utf8', mode: 0o644 })

            const readContent = await fs.readFile(path.join(projectRoot, 'options.txt'), 'utf8')
            expect(readContent).toBe(content)
        })

        it('should write file to mounted folder', async () => {
            const content = 'Mounted file content'

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('@/music')) {
                    const relativePath = fsPath.substring(7)
                    return relativePath ? path.join(mountDir, relativePath) : mountDir
                }
                return null
            })

            await fileSystem.writeFile('@/music/song.txt', content)

            const readContent = await fs.readFile(path.join(mountDir, 'song.txt'), 'utf8')
            expect(readContent).toBe(content)
        })

        it('should throw error when path cannot be resolved', async () => {
            const fileSystem = new NodeExternalFileSystem(async () => null)

            await expect(fileSystem.writeFile('~/test.txt', 'content')).rejects.toThrow('Cannot resolve path: ~/test.txt')
        })

        it('should overwrite existing file', async () => {
            const initialContent = 'Initial content'
            const newContent = 'New content'
            await fs.writeFile(path.join(projectRoot, 'overwrite.txt'), initialContent)

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            await fileSystem.writeFile('~/overwrite.txt', newContent)

            const readContent = await fs.readFile(path.join(projectRoot, 'overwrite.txt'), 'utf8')
            expect(readContent).toBe(newContent)
        })
    })

    describe('stat', () => {
        it('should return file stats for a file', async () => {
            const content = 'Test file content'
            await fs.writeFile(path.join(projectRoot, 'testfile.txt'), content)

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const stats = await fileSystem.stat('~/testfile.txt')

            expect(stats.size).toBe(content.length)
            expect(stats.isFile).toBe(true)
            expect(stats.isDirectory).toBe(false)
            expect(stats.isSymbolicLink).toBe(false)
            expect(typeof stats.mtimeMs).toBe('number')
            expect(typeof stats.atimeMs).toBe('number')
            expect(typeof stats.ctimeMs).toBe('number')
            expect(typeof stats.birthtimeMs).toBe('number')
            expect(typeof stats.mode).toBe('number')
            expect(typeof stats.uid).toBe('number')
            expect(typeof stats.gid).toBe('number')
        })

        it('should return directory stats for a directory', async () => {
            await fs.mkdir(path.join(projectRoot, 'testdir'), { recursive: true })

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const stats = await fileSystem.stat('~/testdir')

            expect(stats.isFile).toBe(false)
            expect(stats.isDirectory).toBe(true)
            expect(stats.isSymbolicLink).toBe(false)
            expect(typeof stats.mtimeMs).toBe('number')
        })

        it('should return stats for mounted folder file', async () => {
            const content = 'Mounted file'
            await fs.writeFile(path.join(mountDir, 'mounted.txt'), content)

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('@/music')) {
                    const relativePath = fsPath.substring(7)
                    return relativePath ? path.join(mountDir, relativePath) : mountDir
                }
                return null
            })

            const stats = await fileSystem.stat('@/music/mounted.txt')

            expect(stats.size).toBe(content.length)
            expect(stats.isFile).toBe(true)
            expect(stats.isDirectory).toBe(false)
        })

        it('should throw error when file does not exist', async () => {
            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            await expect(fileSystem.stat('~/nonexistent.txt')).rejects.toThrow()
        })

        it('should throw error when path cannot be resolved', async () => {
            const fileSystem = new NodeExternalFileSystem(async () => null)

            await expect(fileSystem.stat('~/test.txt')).rejects.toThrow('Cannot resolve path: ~/test.txt')
        })

        it('should return stats with all required boolean properties', async () => {
            await fs.writeFile(path.join(projectRoot, 'checkprops.txt'), 'content')

            const fileSystem = new NodeExternalFileSystem(async (fsPath: string) => {
                if (fsPath.startsWith('~/')) {
                    return path.join(projectRoot, fsPath.substring(2))
                }
                return null
            })

            const stats = await fileSystem.stat('~/checkprops.txt')

            // Verify all boolean properties exist
            expect(typeof stats.isFile).toBe('boolean')
            expect(typeof stats.isDirectory).toBe('boolean')
            expect(typeof stats.isSymbolicLink).toBe('boolean')
            expect(typeof stats.isBlockDevice).toBe('boolean')
            expect(typeof stats.isCharacterDevice).toBe('boolean')
            expect(typeof stats.isFIFO).toBe('boolean')
            expect(typeof stats.isSocket).toBe('boolean')
        })
    })
})

