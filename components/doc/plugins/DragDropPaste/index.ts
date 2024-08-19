/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { DRAG_DROP_PASTE } from "@lexical/rich-text"
import { isMimeType, mergeRegister } from "@lexical/utils"
import {
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DROP_COMMAND,
} from "lexical"
import zip from "lodash/zip"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useFileSystem } from "@/hooks/use-files"
import { getDragFileUrl } from "@/components/file-manager/helper"

import { INSERT_IMAGE_COMMAND } from "../ImagesPlugin"
import { INSERT_AUDIO_FILE_COMMAND } from "../../blocks/audio/plugin"
import { INSERT_VIDEO_FILE_COMMAND } from "../../blocks/video/plugin"
import { INSERT_FILE_COMMAND } from "../../blocks/file/plugin"

const ACCEPTABLE_IMAGE_TYPES = [
  "image/",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/webp",
]

export default function DragDropPaste(): null {
  const [editor] = useLexicalComposerContext()
  // should not be here, but we need to make sure the space is set
  const { space } = useCurrentPathInfo()
  const { addFiles } = useFileSystem()
  useEffect(() => {
    const removeListener = mergeRegister(
      editor.registerCommand(
        DRAG_DROP_PASTE,
        (files) => {
          console.log("files", files)
            ; (async () => {
              const _files = await addFiles(files)
              const fileZip = zip(_files, files)
              for (const [meta, file] of fileZip) {
                const paths = meta!.path.split("/")
                // skip spaces
                const path = "/" + paths.slice(1).join("/")
                if (isMimeType(file!, ACCEPTABLE_IMAGE_TYPES)) {
                  editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                    altText: file!.name,
                    src: path,
                  })
                }
              }
            })()
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand<DragEvent>(
        DROP_COMMAND,
        (event) => {
          if (
            event.dataTransfer?.files &&
            event.dataTransfer?.files.length > 0
          ) {
            return false
          } else {
            const file = getDragFileUrl(event.dataTransfer)
            if (file) {
              switch (file.type) {
                case "image":
                  editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                    altText: file.url,
                    src: file.url,
                  })
                  break
                case "audio":
                  editor.dispatchCommand(INSERT_AUDIO_FILE_COMMAND, file.url)
                  break
                case "video":
                  editor.dispatchCommand(INSERT_VIDEO_FILE_COMMAND, file.url)
                  break
                default:
                  editor.dispatchCommand(INSERT_FILE_COMMAND, {
                    src: file.url,
                    fileName: file.url.split("/").pop() ?? "",
                  })
                  break
              }
              event.preventDefault()
              return true
            }
            return false
          }
        },
        COMMAND_PRIORITY_HIGH
      )
    )

    return () => {
      removeListener()
    }
  }, [addFiles, editor, space])
  return null
}
