import { useState, useRef } from 'react'
import { Attachment } from 'ai'
import { useSqlite } from '@/hooks/use-sqlite'
import { useToast } from '@/components/ui/use-toast'

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { sqlite } = useSqlite()
  const { toast } = useToast()

  const uploadFile = async (file: File) => {
    try {
      if (!sqlite) {
        throw new Error("sqlite not found")
      }
      const response = await sqlite?.file.upload(
        await file.arrayBuffer(),
        file.name,
        file.type,
        ["_chat"]
      )
      const { mime, name, publicUrl } = response
      return {
        url: publicUrl,
        name: name,
        contentType: mime,
      }
    } catch (error) {
      toast({
        title: "Failed to upload file, please try again!",
      })
      throw error
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    setUploadQueue(files.map((file) => file.name))

    try {
      const uploadPromises = files.map((file) => uploadFile(file))
      const uploadedAttachments = await Promise.all(uploadPromises)
      const successfulAttachments = uploadedAttachments.filter(
        (a) => a !== undefined
      )

      setAttachments([...attachments, ...successfulAttachments])
    } catch (error) {
      console.error("Error uploading files!", error)
    } finally {
      setUploadQueue([])
    }
  }

  return {
    attachments,
    setAttachments,
    uploadQueue,
    fileInputRef,
    handleFileChange
  }
} 