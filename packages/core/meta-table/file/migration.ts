import type { BaseFileTable } from "./base"
import { PathMigrationError } from "./errors"

// Mixin to add path migration operations
type Constructor<T = {}> = new (...args: any[]) => T & BaseFileTable

export function WithMigration<T extends Constructor>(Base: T) {
  return class MigrationFileTableMixin extends Base {
    /**
     * Migrate file paths from old format (spaces/{space}/files/{filename}) to new format (files/{filename})
     * This method only updates the database records, it does not move actual files
     * @returns Promise<{ migrated: number, errors: number }> - Number of files migrated and errors encountered
     */
    async migrateFilePaths(): Promise<{ migrated: number, errors: number }> {
      let migrated = 0
      let errors = 0

      try {
        // Get all files with old path format
        const oldPathFiles = await this.dataSpace.exec2(
          `SELECT * FROM ${this.name} WHERE path LIKE 'spaces/%/files/%';`
        )

        console.log(`Found ${oldPathFiles.length} files with old path format to migrate`)

        for (const file of oldPathFiles) {
          try {
            const oldPath = file.path as string
            const pathParts = oldPath.split('/')

            // Extract filename from old path: spaces/{space}/files/{filename}
            if (pathParts.length >= 4 && pathParts[0] === 'spaces' && pathParts[2] === 'files') {
              const filename = pathParts.slice(3).join('/') // Handle subdirectories
              const newPath = `files/${filename}`

              // Check if file already exists with new path
              const existingFile = await this.getFileByPath(newPath)
              if (existingFile) {
                console.warn(`File already exists with new path: ${newPath}, skipping migration for ${oldPath}`)
                // Delete the old record to avoid duplicates
                await this.del(file.id)
                migrated++
                continue
              }

              // Update the path in database only
              this.dataSpace.exec(
                `UPDATE ${this.name} SET path = ? WHERE id = ?;`,
                [newPath, file.id]
              )

              migrated++
              console.log(`Migrated: ${oldPath} -> ${newPath}`)
            } else {
              console.warn(`Invalid old path format: ${oldPath}`)
              errors++
            }
          } catch (error) {
            console.error(`Error migrating file ${file.id}:`, error)
            errors++
          }
        }

        console.log(`Migration completed: ${migrated} files migrated, ${errors} errors`)
        return { migrated, errors }
      } catch (error) {
        console.error('Error during file path migration:', error)
        throw new PathMigrationError(`Migration failed: ${error}`)
      }
    }

    /**
     * Check if file path migration is needed
     * @returns Promise<boolean> - True if migration is needed
     */
    async needsPathMigration(): Promise<boolean> {
      try {
        const oldPathCount = await this.dataSpace.exec2(
          `SELECT COUNT(*) as count FROM ${this.name} WHERE path LIKE 'spaces/%/files/%';`
        )
        return oldPathCount[0].count > 0
      } catch (error) {
        console.error('Error checking migration status:', error)
        return false
      }
    }
  }
}

