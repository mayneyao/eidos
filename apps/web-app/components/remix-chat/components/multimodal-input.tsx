"use client"

import type React from "react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react"
import { sanitizeUIMessages } from "@/packages/ai/utils"
import type { IExtension } from "@/packages/core/meta-table/extension"
import type { ChatRequestOptions, CreateUIMessage, UIMessage } from "ai"
import { useLocalStorage, useWindowSize } from "usehooks-ts"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { AIModelSelect } from "@/components/ai-chat/ai-chat-model-select"
import { useFileUpload } from "@/apps/web-app/hooks/use-file-upload"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import { ArrowUpIcon, PaperclipIcon, StopIcon } from "./icons"
import { PreviewAttachment } from "./preview-attachment"
import { PromptSelector } from "./prompt-selector"

// Define local Attachment interface since it's not exported from ai in v6
interface Attachment {
  name: string;
  contentType: string;
  url: string;
}

// Add helper function to generate random file names
const generateRandomFileName = (extension: string) => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `pasted-image-${timestamp}-${random}${extension}`
}

export function MultimodalInput({
  chatId,
  input,
  setInput,
  isLoading,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
  type,
  aiModel,
  setAIModel,
  prompts,
  selectedCustomPromptId,
  setSelectedCustomPromptId,
}: {
  chatId: string
  input: string
  setInput: (value: string) => void
  isLoading: boolean
  stop: () => void
  attachments: Array<Attachment>
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>
  messages: Array<UIMessage>
  setMessages: Dispatch<SetStateAction<Array<UIMessage>>>
  append: (
    message: UIMessage | CreateUIMessage<any>,
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>
  handleSubmit: (
    event?: {
      preventDefault?: () => void
    },
    chatRequestOptions?: ChatRequestOptions
  ) => void
  className?: string
  type?: IExtension["type"]
  aiModel: string
  setAIModel: (value: string) => void
  prompts?: IExtension[]
  selectedCustomPromptId?: string | null
  setSelectedCustomPromptId?: (value: string | null) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { width } = useWindowSize()

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight()
    }
  }, [])

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${
        textareaRef.current.scrollHeight + 2
      }px`
    }
  }

  const [localStorageInput, setLocalStorageInput] = useLocalStorage("input", "")

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || ""
      setInput(finalValue)
      adjustHeight()
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setLocalStorageInput(input)
  }, [input, setLocalStorageInput])

  // Add effect to adjust height when input changes (especially when cleared)
  useEffect(() => {
    adjustHeight()
  }, [input])

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value)
    adjustHeight()
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([])

  const submitForm = useCallback(() => {
    // window.history.replaceState({}, "", `/chat/${chatId}`)
    // experimental_attachments removed - not supported in AI SDK v6
    handleSubmit()

    setAttachments([])
    setLocalStorageInput("")

    if (width && width > 768) {
      textareaRef.current?.focus()
    }
  }, [
    attachments,
    handleSubmit,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
  ])
  const { addFiles } = useFileUpload()

  const uploadFile = async (file: File) => {
    try {
      const uploadedFiles = await addFiles([file])
      if (uploadedFiles.length > 0) {
        const uploadedFile = uploadedFiles[0]
        return {
          url: "/" + uploadedFile.path,
          name: uploadedFile.name,
          contentType: uploadedFile.mime,
        }
      }
    } catch (error) {
      console.error("Failed to upload file:", error)
      toast({
        title: "Failed to upload file",
        description: "Please try again",
        variant: "destructive",
      })
    }
  }

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])

      setUploadQueue(files.map((file) => file.name))

      try {
        const uploadPromises = files.map((file) => uploadFile(file))
        const uploadedAttachments = await Promise.all(uploadPromises)
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        ) as Array<Attachment>

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ])
      } catch (error) {
        console.error("Error uploading files!", error)
      } finally {
        setUploadQueue([])
      }
    },
    [setAttachments]
  )

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      const imageFiles = Array.from(items)
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => {
          const file = item.getAsFile()
          if (!file) return null

          // Generate random name for pasted image
          const extension =
            file.name === "image.png" ? ".png" : `.${file.type.split("/")[1]}`
          const newFileName = generateRandomFileName(extension)
          return new File([file], newFileName, { type: file.type })
        })
        .filter((file): file is File => file !== null)

      if (imageFiles.length === 0) return

      setUploadQueue(imageFiles.map((file) => file.name))

      try {
        const uploadPromises = imageFiles.map((file) => uploadFile(file))
        const uploadedAttachments = await Promise.all(uploadPromises)
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        ) as Array<Attachment>

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ])
      } catch (error) {
        console.error("Error uploading pasted images!", error)
      } finally {
        setUploadQueue([])
      }
    },
    [setAttachments]
  )

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <div className="grid sm:grid-cols-2 gap-2 w-full"></div>
        )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex flex-row gap-2 overflow-x-scroll items-end">
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
      )}

      <Textarea
        ref={textareaRef}
        placeholder="Send a message..."
        value={input}
        onChange={handleInput}
        // onPaste={handlePaste}
        className={cn(
          "min-h-[48px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-xl text-base bg-muted pb-8",
          className
        )}
        rows={3}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()

            if (isLoading) {
              toast({
                title: "Please wait",
                description: "Wait for the model to finish its response",
                variant: "destructive",
              })
            } else {
              submitForm()
            }
          }
        }}
      />

      <div className="h-fit absolute bottom-0 flex  items-center justify-between w-full p-1.5">
        <div className="flex gap-2 items-center">
          <PromptSelector
            prompts={prompts || []}
            selectedCustomPromptId={selectedCustomPromptId || null}
            onSelectedCustomPromptIdChange={
              setSelectedCustomPromptId || (() => {})
            }
          />
          <AIModelSelect
            onValueChange={setAIModel}
            value={aiModel}
            size="xs"
            noBorder
            className="max-w-[200px] bg-transparent"
          />
        </div>
        <div className="flex gap-2">
          <Button
            className="rounded-full h-fit  m-0.5 dark:border-zinc-700"
            onClick={(event) => {
              event.preventDefault()
              fileInputRef.current?.click()
            }}
            variant="outline"
            disabled={isLoading}
          >
            <PaperclipIcon size={14} />
          </Button>

          {isLoading ? (
            <Button
              className="rounded-full  h-fit  m-0.5 border dark:border-zinc-600"
              onClick={(event) => {
                event.preventDefault()
                stop()
                setMessages((messages) => sanitizeUIMessages(messages))
              }}
            >
              <StopIcon size={14} />
            </Button>
          ) : (
            <Button
              className="rounded-full h-fit m-0.5 border dark:border-zinc-600"
              onClick={(event) => {
                event.preventDefault()
                submitForm()
              }}
              disabled={input.length === 0 || uploadQueue.length > 0}
            >
              <ArrowUpIcon size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
