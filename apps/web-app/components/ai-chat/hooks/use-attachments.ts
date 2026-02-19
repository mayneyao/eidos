import { useState, useRef } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { useFileUpload } from '@/apps/web-app/hooks/use-file-upload'

// Define local Attachment interface since it's not exported from ai in v6
interface Attachment {
  name: string;
  contentType: string;
  url: string;
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addFiles } = useFileUpload()
  const { toast } = useToast()

  const uploadFile = async (file: File) => {
    try {
      const uploadedFiles = await addFiles([file], true, "_chat")
      if (uploadedFiles.length > 0) {
        const uploadedFile = uploadedFiles[0]
        return {
          url: "/" + uploadedFile.path,
          name: uploadedFile.name,
          contentType: uploadedFile.mime,
        }
      }
      throw new Error("Failed to upload file")
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
