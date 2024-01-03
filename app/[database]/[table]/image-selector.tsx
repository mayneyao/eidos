import { useMemo, useRef, useState } from "react"
import { useDrop } from "ahooks"

import { opfsManager } from "@/lib/opfs"
import { cn } from "@/lib/utils"
import { useFileSystem, useFiles } from "@/hooks/use-files"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const colors = [
  "aspect-video rounded-lg bg-red-500",
  "aspect-video rounded-lg bg-yellow-400",
  "aspect-video rounded-lg bg-blue-500",
  "aspect-video rounded-lg bg-pink-200",
  "aspect-video rounded-lg bg-teal-300",
  "aspect-video rounded-lg bg-pink-500",
  "aspect-video rounded-lg bg-blue-200",
  "aspect-video rounded-lg bg-gradient-to-br from-blue-500 to-red-500",
  "aspect-video rounded-lg bg-gradient-to-br from-purple-500 to-pink-500",
  "aspect-video rounded-lg bg-gray-700",
  "aspect-video rounded-lg bg-gradient-to-br from-blue-200 to-red-200",
]
export function ImageSelector(props: {
  onSelected: (url: string, close?: boolean) => void
  onRemove: () => void
}) {
  const { files } = useFiles()
  const images = useMemo(() => {
    return files.filter((file) => file.mime.startsWith("image/"))
  }, [files])
  const dropRef = useRef(null)
  const [isHovering, setIsHovering] = useState(false)
  const { addFiles } = useFileSystem()
  useDrop(dropRef, {
    onFiles: async (files, e) => {
      // when drop files into opfs via file manager, we don't use uuid as file name, keep the original name
      const res = await addFiles(files, false)
      const cover = res[0]
      props.onSelected(opfsManager.getFileUrlByPath(cover.path), true)
    },
    onDragEnter: () => setIsHovering(true),
    onDragLeave: () => setIsHovering(false),
    onDom: (content: string, e) => {
      alert(`custom: ${content} dropped`)
    },
  })

  const handleSelectLocalFile = async () => {
    const [fileHandle] = await (window as any).showOpenFilePicker({
      types: [
        {
          description: "Images",
          accept: {
            "image/*": [".png", ".gif", ".jpeg", ".jpg"],
          },
        },
      ],
      excludeAcceptAllOption: true,
      multiple: false,
    })
    const file = await fileHandle.getFile()
    const res = await addFiles([file], false)
    const cover = res[0]
    props.onSelected(opfsManager.getFileUrlByPath(cover.path), true)
  }

  return (
    <Tabs defaultValue="gallery" className="w-[550px] rounded-lg p-4 shadow">
      <div className="flex w-full justify-between">
        <TabsList>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        <Button variant="destructive" onClick={props.onRemove}>
          Remove
        </Button>
      </div>
      <TabsContent value="gallery">
        <ScrollArea className="h-[600px] ">
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-semibold">Color & Gradient</h2>
            <div className="grid grid-cols-4 gap-4">
              {colors.map((color) => {
                return (
                  <AspectRatio ratio={16 / 9}>
                    <div className={color} key={color} />
                  </AspectRatio>
                )
              })}
            </div>
          </div>
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-semibold">Space Images</h2>
            <div className="grid grid-cols-4 gap-4">
              {images.map((image) => {
                const url = opfsManager.getFileUrlByPath(image.path)
                return (
                  <img
                    onClick={() => props.onSelected(url)}
                    key={image.id}
                    alt="Space image"
                    className="aspect-video rounded-lg object-cover"
                    src={opfsManager.getFileUrlByPath(image.path)}
                  />
                )
              })}
            </div>
          </div>
        </ScrollArea>
      </TabsContent>
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
            <div className="mb-4 text-lg font-semibold">Upload Image</div>
            <div className="mb-4 text-sm">
              Drag and drop your image here or click the button below.
            </div>
            <Button onClick={handleSelectLocalFile}>Upload</Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
