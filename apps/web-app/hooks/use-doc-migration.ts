import { createHeadlessEditor } from "@lexical/headless"
import { $nodesOfType } from "lexical"
import { ImageNode } from "@/components/doc/blocks/image/node"
import { FileNode } from "@/components/doc/blocks/file/node"
import { getAllNodes } from "@/components/doc/nodes"

/**
 * Migrate file paths in document content from old format (/{spaceName}/files/) to new format (/files/)
 * @param content The Lexical editor state JSON string
 * @returns Object with migrated content and count of migrated paths
 */
export async function migrateDocumentFilePaths(content: string): Promise<{
  content: string
  migrated: number
}> {
  let migrated = 0

  return new Promise((resolve, reject) => {
    try {
      const editor = createHeadlessEditor({
        nodes: getAllNodes(),
        onError: (error) => {
          console.error("Lexical editor error during migration:", error)
        },
      })

      // Parse the editor state from the content JSON
      const editorState = editor.parseEditorState(content)
      editor.setEditorState(editorState)

      // Update the editor state to migrate paths
      editor.update(
        () => {
          // Find all ImageNodes
          const imageNodes = $nodesOfType(ImageNode)
          for (const imageNode of imageNodes) {
            const src = imageNode.getSrc()
            // Check if the src matches the old path format: /{spaceName}/files/
            if (src && /^\/[^\/]+\/files\//.test(src)) {
              const newSrc = src.replace(/^\/[^\/]+\/files\//, "/files/")
              imageNode.setSrc(newSrc)
              migrated++
              console.log(`Migrated image path: ${src} -> ${newSrc}`)
            }
          }

          // Find all FileNodes
          const fileNodes = $nodesOfType(FileNode)
          for (const fileNode of fileNodes) {
            const src = fileNode.__src
            // Check if the src matches the old path format
            if (src && /^\/[^\/]+\/files\//.test(src)) {
              const newSrc = src.replace(/^\/[^\/]+\/files\//, "/files/")
              fileNode.setSrc(newSrc)
              migrated++
              console.log(`Migrated file path: ${src} -> ${newSrc}`)
            }
          }
        },
        {
          discrete: true,
        }
      )

      // Get the updated editor state
      const updatedState = editor.getEditorState().toJSON()
      const updatedContent = JSON.stringify(updatedState)

      resolve({
        content: updatedContent,
        migrated,
      })
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Check if a document content needs file path migration
 * @param content The Lexical editor state JSON string
 * @returns True if migration is needed
 */
export function needsDocumentPathMigration(content: string): boolean {
  try {
    // Simple check: look for old path pattern in the JSON string
    // Pattern: /{anything}/files/
    return /\/[^\/]+\/files\//.test(content)
  } catch (error) {
    console.error("Error checking migration need:", error)
    return false
  }
}
