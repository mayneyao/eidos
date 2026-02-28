import { useContext, useEffect, useState } from "react"

import { FileField } from "@/packages/core/fields/file"
import type { IField } from "@/packages/core/types/IField"
import {
  cn,
  getBlockIdFromUrl,
  getBlockUrlWithParams,
  shortenId,
} from "@/lib/utils"
import { getHeadlessEditor } from "@/apps/web-app/hooks/use-doc-editor"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { BlockApp } from "@/components/block-renderer/block-app"
import { InnerEditor } from "@/components/doc/editor"
import { getFirstImageUrl } from "@/components/doc/utils/helper"
import { FilePreview } from "@/components/table/views/grid/cells/file/file-preview"

import { TableContext } from "../../hooks"

interface GalleryCardCoverProps {
  item: any
  coverField?: IField
  coverPreview?: string
  fitContent?: boolean
  rawIdNameMap: Map<string, string>
}

export const GalleryCardCover = ({
  item,
  coverField,
  coverPreview,
  rawIdNameMap,
  fitContent,
}: GalleryCardCoverProps) => {
  const getCoverUrl = (row: any, field?: IField) => {
    if (!field) return ""
    const fileField = new FileField(field)
    const cv = row[field.table_column_name]
    return fileField.getCellContent(cv).data.displayData[0]
  }

  const { isView } = useContext(TableContext)
  const showContent =
    coverPreview == undefined || coverPreview === "__CONTENT__"
  const showBlock = coverPreview?.startsWith("block://")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
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

  if (showBlock) {
    return <BlockApp url={blockUrl} />
  }

  if (imageUrl) {
    return (
      <>
        <img
          src={imageUrl}
          alt=""
          className="h-[200px] w-full object-cover cursor-pointer"
          onClick={() => setShowPreview(true)}
        />
        {showPreview && (
          <FilePreview
            url={imageUrl}
            type="image"
            onClose={() => setShowPreview(false)}
          />
        )}
      </>
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

  // If it's a field (not __CONTENT__, not block://), show the field's image
  if (
    coverField &&
    coverPreview &&
    coverPreview !== "__CONTENT__" &&
    !coverPreview.startsWith("block://")
  ) {
    const coverUrl = getCoverUrl(item, coverField)
    if (!coverUrl) return null
    return (
      <>
        <img
          src={coverUrl}
          alt=""
          className={cn(
            "h-[200px] w-full cursor-pointer",
            fitContent ? "object-contain" : "object-cover"
          )}
          onClick={() => setShowPreview(true)}
        />
        {showPreview && (
          <FilePreview
            url={coverUrl}
            type="image"
            onClose={() => setShowPreview(false)}
          />
        )}
      </>
    )
  }

  return null
}
