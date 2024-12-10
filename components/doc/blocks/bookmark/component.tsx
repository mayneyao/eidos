import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, NodeKey } from "lexical"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { $isBookmarkNode, BookmarkPayload } from "./node"
import "./style.css"
import { useState } from "react"

import { proxyURL } from "@/lib/utils"
import { Loading } from "@/components/loading"

function BookmarkPlaceholder(props: { nodeKey: string }) {
  const { nodeKey } = props
  const [editor] = useLexicalComposerContext()
  const [loading, setLoading] = useState(false)

  const handleSelect = async () => {
    const src = (document.getElementById("web-url") as HTMLInputElement).value
    setLoading(true)
    const data = await fetch(`https://link-preview.eidos.space/?q=${src}`)
    const json = await data.json()
    setLoading(false)

    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isBookmarkNode(node)) {
        if (json.error) {
          node.setAll({
            title: src,
            url: src,
          })
        } else {
          node.setAll(json)
        }
      }
    })
  }

  return (
    <Popover>
      <PopoverTrigger className="w-full">
        <div className="flex h-[70px] w-full items-center justify-center bg-gray-200">
          <div className="text-center">
            {loading ? (
              <Loading />
            ) : (
              <div className="text-sm text-gray-500">Add an bookmark</div>
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4">
        <div className="mt-4 flex w-[350px] flex-col gap-2">
          <Input
            className="grow rounded-lg border border-gray-300 px-3 py-2"
            placeholder="https://eidos.space"
            id="web-url"
            autoFocus
          />
          <Button size="sm" className="w-full" onClick={() => handleSelect()}>
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export const BookmarkComponent = (
  props: BookmarkPayload & { nodeKey: NodeKey }
) => {
  if (!props.url.length) {
    return <BookmarkPlaceholder nodeKey={props.nodeKey} />
  }

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noreferrer"
      className="no-underline"
    >
      <div className="not-prose grid h-auto w-full grid-cols-[3fr,1fr] border hover:cursor-pointer hover:bg-secondary">
        <div className="overflow-auto p-2">
          <div className="truncate text-lg font-bold">{props.title}</div>
          <div className="line-clamp-3 text-sm text-gray-500 ">
            {props.description}
          </div>
          <div className="text-sm text-gray-500">{props.url}</div>
        </div>
        <div className="relative">
          <div className="h-full w-full">
            {props.image && (
              <img
                src={proxyURL(props.image)}
                alt=""
                className="absolute inset-0 hidden h-full w-full object-cover md:block"
              />
            )}
          </div>
        </div>
      </div>
    </a>
  )
}
