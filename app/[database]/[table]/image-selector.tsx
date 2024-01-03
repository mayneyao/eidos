import { useMemo } from "react"

import { opfsManager } from "@/lib/opfs"
import { useFiles } from "@/hooks/use-files"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"

export function ImageSelector(props: {
  onSelected: (url: string) => void
  onRemove: () => void
}) {
  const { files } = useFiles()
  const images = useMemo(() => {
    return files.filter((file) => file.mime.startsWith("image/"))
  }, [files])

  return (
    <div className="mx-auto max-w-[550px] rounded-lg bg-white p-6 shadow">
      <div className="mb-4 flex justify-between">
        <nav className="flex space-x-4">
          <Button className="bg-blue-500 text-white" variant="default">
            Gallery
          </Button>
          <Button variant="ghost">Upload</Button>
          <Button variant="ghost">Link</Button>
          <Button variant="ghost">
            <InstagramIcon className="text-gray-700" />
          </Button>
        </nav>
        <Button variant="destructive" onClick={props.onRemove}>
          Remove
        </Button>
      </div>
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Color & Gradient</h2>
        <div className="grid grid-cols-4 gap-4">
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-red-500" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-yellow-400" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-blue-500" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-pink-200" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-teal-300" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-pink-500" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-red-600" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-blue-200" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-gradient-to-br from-blue-500 to-red-500" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-gradient-to-br from-purple-500 to-pink-500" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-gray-700" />
          </AspectRatio>
          <AspectRatio ratio={16 / 9}>
            <div className="aspect-video rounded-lg bg-gradient-to-br from-blue-200 to-red-200" />
          </AspectRatio>
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
    </div>
  )
}

function InstagramIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}
