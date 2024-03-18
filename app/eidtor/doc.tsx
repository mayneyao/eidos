import { PureEditor } from "@/components/doc/pure-editor"

import { useLaunchQueue } from "./hooks"

export const DocEditor = () => {
  const { rowText } = useLaunchQueue()
  return (
    <PureEditor
      isEditable
      markdown={rowText}
      title={"title"}
      showTitle={false}
    />
  )
}
