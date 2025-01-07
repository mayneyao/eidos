import { Attachment } from 'ai'
import { PreviewAttachment } from '../remix-chat/components/preview-attachment'

interface AIChatAttachmentsProps {
  attachments: Attachment[]
  uploadQueue: string[]
}

export function AIChatAttachments({ attachments, uploadQueue }: AIChatAttachmentsProps) {
  if (attachments.length === 0 && uploadQueue.length === 0) {
    return null
  }

  return (
    <div className="flex flex-row gap-2 overflow-x-scroll items-end mb-2">
      {attachments.map((attachment) => (
        <PreviewAttachment key={attachment.url} attachment={attachment} />
      ))}
      {uploadQueue.map((filename) => (
        <PreviewAttachment
          key={filename}
          attachment={{
            url: "",
            name: filename,
            contentType: "",
          }}
          isUploading={true}
        />
      ))}
    </div>
  )
} 