import { useDrop } from "ahooks"
import { useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"

import { useAllMblocks } from "@/apps/web-app/hooks/use-all-mblocks"
import { useFileUpload, useFiles } from "@/apps/web-app/hooks/use-file-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getFilePreviewImage } from "@/lib/mime/mime"
import { cn, proxyURL } from "@/lib/utils"

export const DefaultColors = [
  "bg-red-500",
  "bg-yellow-400",
  "bg-blue-500",
  "bg-pink-200",
  "bg-teal-300",
  "bg-pink-500",
  "bg-blue-200",
  "bg-gradient-to-br from-blue-500 to-red-500",
  "bg-gradient-to-br from-purple-500 to-pink-500",
  "bg-gray-700",
  "bg-gradient-to-br from-blue-200 to-red-200",
]

export function FileSelector(props: {
  onSelected: (url: string, close?: boolean) => void
  onRemove: () => void
  disableColor?: boolean
  hideRemove?: boolean
  height?: number
  onlyImage?: boolean
  hideGallery?: boolean
  showBlock?: boolean
}) {
  const { mblocks: allMblocks } = useAllMblocks()
  const { files } = useFiles()
  const { database } = useParams()
  const images = useMemo(() => {
    return files.filter((file) => file.mime.startsWith("image/"))
  }, [files])

  console.log("files", files)

  const dropRef = useRef(null)
  const [isHovering, setIsHovering] = useState(false)
  const { addFiles } = useFileUpload()
  // color
  const handleSelectColor = (color: string) => {
    const url = `color://${color}`
    props.onSelected(url)
  }

  // web file
  const handleSelectWebFile = async () => {
    const url = (document.getElementById("web-image-url") as HTMLInputElement)
      .value
    const cover = proxyURL(url)
    props.onSelected(cover, true)
  }

  // local file
  useDrop(dropRef, {
    onFiles: async (files, e) => {
      // when drop files into opfs via file manager, we don't use uuid as file name, keep the original name
      const res = await addFiles(files, false)
      const cover = res[0]
      props.onSelected(`/${cover.path}`, true)
    },
    onDragEnter: () => setIsHovering(true),
    onDragLeave: () => setIsHovering(false),
    onDom: (content: string, e) => {
      alert(`custom: ${content} dropped`)
    },
  })

  const handleSelectLocalFile = async () => {
    const opts: OpenFilePickerOptions = {
      excludeAcceptAllOption: true,
      multiple: false,
    }
    if (props.onlyImage) {
      opts.types = [
        {
          description: "Images",
          accept: {
            "image/*": [".png", ".gif", ".jpeg", ".jpg"],
          },
        },
      ]
    } else {
      opts.types = [
        {
          description: "All Files",
          accept: {
            "*/*": [],
          },
        },
      ]
    }
    const [fileHandle] = await window.showOpenFilePicker(opts)
    const file = await fileHandle.getFile()
    const res = await addFiles([file], false)
    const cover = res[0]
    props.onSelected(`/${cover.path}`, true)
  }

  return (
    <Tabs
      defaultValue={props.hideGallery ? "upload" : "gallery"}
      className="w-[320px] rounded-md p-2 sm:w-[480px]"
    >
      <div className="flex w-full justify-between items-center mb-2">
        <TabsList className="h-8">
          {!props.hideGallery && (
            <TabsTrigger value="gallery" className="text-xs px-2 py-1">Gallery</TabsTrigger>
          )}
          {props.showBlock && <TabsTrigger value="block" className="text-xs px-2 py-1">Block</TabsTrigger>}
          <TabsTrigger value="upload" className="text-xs px-2 py-1">Load</TabsTrigger>
          <TabsTrigger value="url" className="text-xs px-2 py-1">URL</TabsTrigger>
        </TabsList>
        {!props.hideRemove && (
          <Button size="sm" variant="destructive" onClick={props.onRemove} className="h-7 px-2 text-xs">
            Remove
          </Button>
        )}
      </div>
      {!props.hideGallery && (
        <TabsContent value="gallery" className="mt-0">
          <ScrollArea
            className={cn({
              "h-[400px]": !props.height,
              [`h-[${props.height}px]`]: props.height,
            })}
          >
            {!props.disableColor && (
              <div className="mb-3">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Colors</h3>
                <div className="grid grid-cols-6 gap-2">
                  {DefaultColors.map((color) => {
                    return (
                      <div
                        className={cn(
                          "aspect-square cursor-pointer rounded-md border border-border/20",
                          color
                        )}
                        key={color}
                        onClick={() => handleSelectColor(color)}
                      />
                    )
                  })}
                </div>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Images</h3>
              <div className="grid grid-cols-5 gap-2">
                {images.map((image) => {
                  const url = `/${image.path}`
                  const _url = getFilePreviewImage(url)
                  return (
                    <img
                      onClick={() => props.onSelected(url)}
                      key={image.id}
                      alt={image.name}
                      className="aspect-square cursor-pointer rounded-md object-cover border border-border/20"
                      src={_url}
                    />
                  )
                })}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      )}
      {props.showBlock && (
        <TabsContent value="block" className="mt-0">
          <ScrollArea
            className={cn({
              "h-[400px]": !props.height,
              [`h-[${props.height}px]`]: props.height,
            })}
          >
            <div className="grid grid-cols-2 gap-2">
              {allMblocks.map((block) => (
                <div
                  key={block.id}
                  className="cursor-pointer rounded-md border border-border/20 p-2 text-sm hover:bg-accent"
                  onClick={() => props.onSelected(`block://${block.id}`)}
                >
                  {block.name}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      )}
      <TabsContent value="upload" ref={dropRef} className="mt-0">
        <div
          className={cn(
            "flex h-[200px] items-center justify-center rounded-md border-2 border-dashed",
            {
              "border-primary": isHovering,
              "border-border": !isHovering,
            }
          )}
        >
          <div className="text-center">
            <div className="mb-2 text-sm font-medium">
              {props.onlyImage ? "Upload Image" : "Upload File"}
            </div>
            <div className="mb-3 text-xs text-muted-foreground">
              Drag & drop or click to select
            </div>
            <Button size="sm" onClick={handleSelectLocalFile} className="h-7 px-3 text-xs">
              Browse
            </Button>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="url" className="mt-0">
        <div className="flex gap-2">
          <Input
            className="grow rounded-md border-border px-2 py-1 text-sm h-8"
            placeholder="https://example.com/image.png"
            id="web-image-url"
          />
          <Button size="sm" onClick={handleSelectWebFile} className="h-8 px-3 text-xs">
            Add
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}
