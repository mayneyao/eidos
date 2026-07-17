import { useCallback, useState, useEffect } from "react"
import { useSqlite } from "./use-sqlite"
import { getUuid } from "@/lib/utils"
import type { IFile } from "@/packages/core/meta-table/file"

export const useFileUpload = () => {
  const { sqlite } = useSqlite()

  const addFiles = useCallback(
    async (
      files: File[],
      useUuId: boolean = true,
      parentPath?: string
    ): Promise<IFile[]> => {
      if (!sqlite) {
        throw new Error("add file failed, no sqlite instance")
      }

      const res: IFile[] = []
      for (const file of files) {
        // Use sqlite.file.upload which handles writing to FS and DB
        // It uploads to root files dir by default.
        // We can pass a custom path if needed, but for now we stick to the default behavior
        // which matches what we did in use-files.ts refactor.

        // Actually, sqlite.file.upload implementation in upload.ts:
        // const path = `~/.eidos/files/${fileId}.${ext}`
        // So it handles UUID generation if we don't provide a specific path?
        // Wait, upload.ts takes (data, options). options has fileName.
        // If we want to control the filename (UUID or original), we should pass it.

        let fileName = file.name
        if (useUuId) {
          const ext = file.name.split(".").pop() || ""
          const fileId = getUuid()
          fileName = `${fileId}.${ext}`
        }

        // We can use sqlite.file.upload if it supports File object or ArrayBuffer
        // Convert File to ArrayBuffer for IPC transfer
        const arrayBuffer = await file.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)

        const ext = fileName.split(".").pop() || ""
        // If useUuId is false, we might want to keep original name, but path usually uses UUID in this system?
        // The previous logic in upload.ts was: `~/.eidos/files/${fileId}.${ext}`
        // If we want to support non-UUID paths, we need to decide.
        // But here we can stick to the pattern: ~/.eidos/files/<uuid>.<ext>
        // Or if useUuId is false, maybe we use the name?
        // Let's follow the previous upload.ts logic:
        // finalFileName = fileName || source.split("/").pop() || `file-${fileId}`
        // path = `~/.eidos/files/${fileId}.${ext}`
        // Wait, upload.ts ALWAYS used fileId in path: `const path = \`~/.eidos/files/${fileId}.${ext}\``
        // So even if we preserve the fileName in DB, the path on disk uses UUID.

        const fileId = getUuid()
        const eidosFilePath = parentPath
          ? `~/.eidos/files/${parentPath}`
          : `~/.eidos/files`
        const path = `${eidosFilePath}/${fileId}.${ext}`

        // Write to file system
        await sqlite.fs.writeFile(path, uint8Array)

        const fileInfo: IFile = {
          id: fileId,
          name: fileName,
          size: file.size,
          mime: file.type,
          path: path.replace("~/.eidos/", ""),
          updated_at: new Date().toISOString(),
        }

        const savedFile = await sqlite.file.add(fileInfo)

        if (savedFile) {
          res.push(savedFile)
        }
      }
      return res
    },
    [sqlite]
  )

  return {
    addFiles,
  }
}

export const useFiles = () => {
  const { sqlite } = useSqlite()
  const [files, setFiles] = useState<IFile[]>([])
  useEffect(() => {
    const fetchFiles = async () => {
      const files = await sqlite?.file.list()
      setFiles(files?.reverse() ?? [])
    }
    fetchFiles()
  }, [sqlite])
  return { files }
}
