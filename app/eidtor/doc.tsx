import { Editor } from "@/components/doc/editor"

import { useLaunchQueue } from "./hooks"

export const DocEditor = () => {
  useLaunchQueue()
  return (
    <div>
      <Editor isEditable docId={""} title={"title"} showTitle={false} />
    </div>
  )
}
