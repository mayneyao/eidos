import { useMemo, useRef, useState } from "react"
import { useDrop, useVirtualList } from "ahooks"

import { getFilePreviewImage } from "@/lib/mime/mime"
import { cn, proxyURL } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAllMblocks } from "@/apps/web-app/hooks/use-all-mblocks"
import { useFileUpload, useFiles } from "@/apps/web-app/hooks/use-file-upload"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import type { IExtension } from "@/packages/core/meta-table/extension"
import type { IFile } from "@/packages/core/meta-table/file"

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
  const { params } = useRouterAdapter()
  const { database } = params
  const images = useMemo(() => {
    return files.filter((file) => file.mime.startsWith("image/"))
  }, [files])

  const galleryContainerRef = useRef<HTMLDivElement>(null)
  const galleryWrapperRef = useRef<HTMLDivElement>(null)

  const galleryItems = useMemo(() => {
    const items: (
      | { type: "colors" }
      | { type: "header"; title: string }
      | { type: "image-row"; data: IFile[]; index: number }
    )[] = []
    if (!props.disableColor) {
      items.push({ type: "colors" })
    }
    items.push({ type: "header", title: "Images" })
    for (let i = 0; i < images.length; i += 5) {
      items.push({
        type: "image-row",
        data: images.slice(i, i + 5),
        index: i / 5,
      })
    }
    return items
  }, [images, props.disableColor])

  const [galleryList] = useVirtualList(galleryItems, {
    containerTarget: galleryContainerRef,
    wrapperTarget: galleryWrapperRef,
    itemHeight: (index) => {
      const item = galleryItems[index]
      if (item.type === "colors") return 120
      if (item.type === "header") return 32
      return 100
    },
    overscan: 10,
  })

  const blockContainerRef = useRef<HTMLDivElement>(null)
  const blockWrapperRef = useRef<HTMLDivElement>(null)

  const blockRows = useMemo(() => {
    const rows: IExtension[][] = []
    for (let i = 0; i < allMblocks.length; i += 2) {
      rows.push(allMblocks.slice(i, i + 2))
    }
    return rows
  }, [allMblocks])

  const [blockList] = useVirtualList(blockRows, {
    containerTarget: blockContainerRef,
    wrapperTarget: blockWrapperRef,
    itemHeight: 40,
    overscan: 10,
  })

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
            <TabsTrigger value="gallery" className="text-xs px-2 py-1">
              Gallery
            </TabsTrigger>
          )}
          {props.showBlock && (
            <TabsTrigger value="block" className="text-xs px-2 py-1">
              Block
            </TabsTrigger>
          )}
          <TabsTrigger value="upload" className="text-xs px-2 py-1">
            Load
          </TabsTrigger>
          <TabsTrigger value="url" className="text-xs px-2 py-1">
            URL
          </TabsTrigger>
        </TabsList>
        {!props.hideRemove && (
          <Button
            size="sm"
            variant="destructive"
            onClick={props.onRemove}
            className="h-7 px-2 text-xs"
          >
            Remove
          </Button>
        )}
      </div>
      {!props.hideGallery && (
        <TabsContent value="gallery" className="mt-0">
          <div
            ref={galleryContainerRef}
            className={cn("overflow-y-auto pr-3", {
              "h-[400px]": !props.height,
            })}
            style={props.height ? { height: props.height } : {}}
          >
            <div ref={galleryWrapperRef}>
              {galleryList.map((item) => {
                const data = item.data
                if (data.type === "colors") {
                  return (
                    <div className="mb-3" key="colors">
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Colors
                      </h3>
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
                  )
                }
                if (data.type === "header") {
                  return (
                    <h3
                      className="mb-2 text-sm font-medium text-muted-foreground"
                      key="header"
                    >
                      {data.title}
                    </h3>
                  )
                }
                if (data.type === "image-row") {
                  return (
                    <div
                      className="grid grid-cols-5 gap-2 mb-2"
                      key={`row-${data.index}`}
                    >
                      {data.data.map((image: IFile) => {
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
                  )
                }
                return null
              })}
            </div>
          </div>
        </TabsContent>
      )}
      {props.showBlock && (
        <TabsContent value="block" className="mt-0">
          <div
            ref={blockContainerRef}
            className={cn("overflow-y-auto pr-3", {
              "h-[400px]": !props.height,
            })}
            style={props.height ? { height: props.height } : {}}
          >
            <div ref={blockWrapperRef}>
              {blockList.map((item) => (
                <div key={item.index} className="grid grid-cols-2 gap-2 mb-2">
                  {item.data.map((block: IExtension) => (
                    <div
                      key={block.id}
                      className="cursor-pointer rounded-md border border-border/20 p-2 text-sm hover:bg-accent h-[32px] flex items-center"
                      onClick={() => props.onSelected(`block://${block.id}`)}
                    >
                      {block.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
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
            <Button
              size="sm"
              onClick={handleSelectLocalFile}
              className="h-7 px-3 text-xs"
            >
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
          <Button
            size="sm"
            onClick={handleSelectWebFile}
            className="h-8 px-3 text-xs"
          >
            Add
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}
