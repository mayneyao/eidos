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
import { IScript } from "@/worker/web-worker/meta-table/script"
import type { Attachment, ChatRequestOptions, CreateMessage, Message } from "ai"
import cx from "classnames"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { useLocalStorage, useWindowSize } from "usehooks-ts"

import { sanitizeUIMessages } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { getSuggestedActions } from "@/apps/web-app/[database]/scripts/helper"

import { ArrowUpIcon, PaperclipIcon, StopIcon } from "./icons"
import { PreviewAttachment } from "./preview-attachment"

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
}: {
  chatId: string
  input: string
  setInput: (value: string) => void
  isLoading: boolean
  stop: () => void
  attachments: Array<Attachment>
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>
  messages: Array<Message>
  setMessages: Dispatch<SetStateAction<Array<Message>>>
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>
  handleSubmit: (
    event?: {
      preventDefault?: () => void
    },
    chatRequestOptions?: ChatRequestOptions
  ) => void
  className?: string
  type?: IScript["type"]
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
  const suggestedActions = getSuggestedActions(type ?? "script")

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

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value)
    adjustHeight()
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([])

  const submitForm = useCallback(() => {
    // window.history.replaceState({}, "", `/chat/${chatId}`)

    handleSubmit(undefined, {
      experimental_attachments: attachments,
    })

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
  const { sqlite } = useSqlite()

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
      toast.error("Failed to upload file, please try again!")
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
          <div className="grid sm:grid-cols-2 gap-2 w-full">
            {suggestedActions.map((suggestedAction, index) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ delay: 0.05 * index }}
                key={`suggested-action-${suggestedAction.title}-${index}`}
                className={index > 1 ? "hidden sm:block" : "block"}
              >
                <Button
                  variant="ghost"
                  onClick={async () => {
                    // window.history.replaceState({}, "", `/chat/${chatId}`)
                    append({
                      role: "user",
                      content: suggestedAction.action,
                    })
                  }}
                  className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
                >
                  <span className="font-medium">{suggestedAction.title}</span>
                  <span className="text-muted-foreground">
                    {suggestedAction.label}
                  </span>
                </Button>
              </motion.div>
            ))}
          </div>
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
        onPaste={handlePaste}
        className={cx(
          "min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-xl text-base bg-muted",
          className
        )}
        rows={3}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()

            if (isLoading) {
              toast.error("Please wait for the model to finish its response!")
            } else {
              submitForm()
            }
          }
        }}
      />

      {isLoading ? (
        <Button
          className="rounded-full p-1.5 h-fit absolute bottom-2 right-2 m-0.5 border dark:border-zinc-600"
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
          className="rounded-full p-1.5 h-fit absolute bottom-2 right-2 m-0.5 border dark:border-zinc-600"
          onClick={(event) => {
            event.preventDefault()
            submitForm()
          }}
          disabled={input.length === 0 || uploadQueue.length > 0}
        >
          <ArrowUpIcon size={14} />
        </Button>
      )}

      <Button
        className="rounded-full p-1.5 h-fit absolute bottom-2 right-11 m-0.5 dark:border-zinc-700"
        onClick={(event) => {
          event.preventDefault()
          fileInputRef.current?.click()
        }}
        variant="outline"
        disabled={isLoading}
      >
        <PaperclipIcon size={14} />
      </Button>
    </div>
  )
}
