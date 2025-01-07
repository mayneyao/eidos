import { FileField } from "@/lib/fields/file"
import { IField } from "@/lib/store/interface"
import { getBlockIdFromUrl, getBlockUrlWithParams, shortenId } from "@/lib/utils"
import { BlockApp } from "@/components/block-renderer/block-app"
import { InnerEditor } from "@/components/doc/editor"

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
  
  const itemJSON = Object.fromEntries(
    Object.entries(item).map(([k, v]) => {
      const fieldName = rawIdNameMap.get(k)!
      return [fieldName, v]
    })
  )

  const blockUrl = showBlock
    ? getBlockUrlWithParams(getBlockIdFromUrl(coverPreview || ""), itemJSON)
    : ""

  if (coverPreview?.startsWith("cl_")) {
    const coverUrl = getCoverUrl(item, coverField)
    return (
      <img src={coverUrl} alt="" className="h-[200px] w-full object-cover" />
    )
  }

  if (showBlock) {
    return <BlockApp url={blockUrl} />
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