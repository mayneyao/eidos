import { useEffect, useState } from "react"

import { FileField } from "@/lib/fields/file"
import { IField } from "@/lib/store/interface"
import {
  getBlockIdFromUrl,
  getBlockUrlWithParams,
  shortenId,
} from "@/lib/utils"
import { getHeadlessEditor } from "@/hooks/use-doc-editor"
import { useSqlite } from "@/hooks/use-sqlite"
import { BlockApp } from "@/components/block-renderer/block-app"
import { InnerEditor } from "@/components/doc/editor"
import { getFirstImageUrl } from "@/components/doc/utils/helper"

interface GalleryCardCoverProps {
  item: any
  coverField?: IField
  coverPreview?: string
  rawIdNameMap: Map<string, string>
}

export const GalleryCardCover = ({
  item,
  coverField,
  coverPreview,
  rawIdNameMap,
}: GalleryCardCoverProps) => {
  const getCoverUrl = (row: any, field?: IField) => {
    if (!field) return ""
    const fileField = new FileField(field)
    const cv = row[field.table_column_name]
    return fileField.getCellContent(cv).data.displayData[0]
  }

  const showContent = coverPreview == undefined || coverPreview === "content"
  const showBlock = coverPreview?.startsWith("block://")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const { getDoc } = useSqlite()

  const itemJSON = Object.fromEntries(
    Object.entries(item).map(([k, v]) => {
      const fieldName = rawIdNameMap.get(k)!
      return [fieldName, v]
    })
  )

  const blockUrl = showBlock
    ? getBlockUrlWithParams(getBlockIdFromUrl(coverPreview || ""), itemJSON)
    : ""

  useEffect(() => {
    if (showContent) {
      getDoc(shortenId(item._id)).then((docContent) => {
        const editor = getHeadlessEditor()
        if (!docContent) return
        const editorState = editor.parseEditorState(docContent)
        const image = getFirstImageUrl(editorState)
        if (image) {
          setImageUrl(image)
        }
      })
    } else {
      setImageUrl(null)
    }
  }, [item._id, coverPreview])

  if (coverPreview?.startsWith("cl_")) {
    const coverUrl = getCoverUrl(item, coverField)
    return (
      <img src={coverUrl} alt="" className="h-[200px] w-full object-cover" />
    )
  }

  if (showBlock) {
    return <BlockApp url={blockUrl} />
  }

  if (imageUrl) {
    return (
      <img src={imageUrl} alt="" className="h-[200px] w-full object-cover" />
    )
  }
  if (showContent) {
    return (
      <div className="h-[200px] w-full overflow-hidden object-cover">
        <InnerEditor
          docId={shortenId(item._id)}
          namespace="eidos-notes-home-page"
          isEditable={false}
          placeholder=""
          disableSelectionPlugin
          disableSafeBottomPaddingPlugin
          disableUpdateTitle
          disableManuallySave
          className="prose-sm ml-0 !h-[200px] bg-gray-50 p-2 dark:bg-gray-700"
        />
      </div>
    )
  }

  return null
}
