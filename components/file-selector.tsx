import { useDrop } from "ahooks"
import { useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"

import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useFileSystem, useFiles } from "@/hooks/use-files"
import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { getFilePreviewImage } from "@/lib/mime/mime"
import { cn, proxyImageURL } from "@/lib/utils"

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
}) {
  const { files } = useFiles()
  const { efsManager } = useEidosFileSystemManager()
  const { database } = useParams()
  const images = useMemo(() => {
    return files.filter((file) => file.mime.startsWith("image/"))
  }, [files])

  const dropRef = useRef(null)
  const [isHovering, setIsHovering] = useState(false)
  const { addFiles } = useFileSystem()
  // color
  const handleSelectColor = (color: string) => {
    const url = `color://${color}`
    props.onSelected(url)
  }

  // web file
  const handleSelectWebFile = async () => {
    const url = (document.getElementById("web-image-url") as HTMLInputElement)
      .value
    const cover = proxyImageURL(url)
    props.onSelected(cover, true)
  }

  // local file
  useDrop(dropRef, {
    onFiles: async (files, e) => {
      // when drop files into opfs via file manager, we don't use uuid as file name, keep the original name
      const res = await addFiles(files, false)
      const cover = res[0]
      props.onSelected(efsManager.getFileUrlByPath(cover.path), true)
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
    props.onSelected(efsManager.getFileUrlByPath(cover.path), true)
  }

  return (
    <Tabs
      defaultValue={props.hideGallery ? "upload" : "gallery"}
      className="w-[350px] rounded-lg p-4 shadow sm:w-[550px]"
    >
      <div className="flex w-full justify-between">
        <TabsList>
          {!props.hideGallery && (
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
          )}

          <TabsTrigger value="upload">Load</TabsTrigger>
          <TabsTrigger value="url">URL</TabsTrigger>
        </TabsList>
        {!props.hideRemove && (
          <Button size="sm" variant="destructive" onClick={props.onRemove}>
            Remove
          </Button>
        )}
      </div>
      {!props.hideGallery && (
        <TabsContent value="gallery">
          <ScrollArea
            className={cn({
              "h-[600px]": !props.height,
              [`h-[${props.height}px]`]: props.height,
            })}
          >
            {!props.disableColor && (
              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold">Color & Gradient</h2>
                <div className="grid grid-cols-4 gap-4">
                  {DefaultColors.map((color) => {
                    return (
                      <AspectRatio
                        ratio={16 / 9}
                        key={color}
                        onClick={() => handleSelectColor(color)}
                      >
                        <div
                          className={cn(
                            "aspect-video cursor-pointer rounded-lg",
                            color
                          )}
                          key={color}
                        />
                      </AspectRatio>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold">Space Images</h2>
              <div className="grid grid-cols-4 gap-4">
                {images.map((image) => {
                  const url = efsManager.getFileUrlByPath(image.path, database)
                  const _url = getFilePreviewImage(url)
                  return (
                    <img
                      onClick={() => props.onSelected(url)}
                      key={image.id}
                      alt={image.name}
                      className="aspect-video cursor-pointer rounded-lg object-cover"
                      src={_url}
                    />
                  )
                })}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      )}
      <TabsContent value="upload" ref={dropRef}>
        <div
          className={cn(
            "flex h-[300px] items-center justify-center rounded-lg border-2 border-dashed",
            {
              "border-green-500": isHovering,
              "border-gray-300": !isHovering,
            }
          )}
        >
          <div className="text-center">
            <div className="mb-4 text-lg font-semibold">
              {props.onlyImage ? "Load local image" : "Load local file"}
            </div>
            <div className="mb-4 text-sm">
              Drag and drop your {props.onlyImage ? "image" : "file"} here or
              click the button below.
            </div>
            <Button size="sm" onClick={handleSelectLocalFile}>
              Load
            </Button>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="url">
        <div className="mt-4 flex h-[60px] gap-2">
          <Input
            className="grow rounded-lg border border-gray-300 px-3 py-2"
            placeholder="https://example.com/image.png"
            id="web-image-url"
          />
          <Button size="sm" onClick={handleSelectWebFile}>
            Confirm
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}
