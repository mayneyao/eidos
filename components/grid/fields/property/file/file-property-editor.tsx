import { useState } from "react"

import { FileProperty } from "@/lib/fields/file"
import { IUIColumn } from "@/hooks/use-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface IFieldPropertyEditorProps {
  uiColumn: IUIColumn<FileProperty>
  onPropertyChange: (property: FileProperty) => void
  onSave?: () => void
  isCreateNew?: boolean
}

export const FilePropertyEditor = (props: IFieldPropertyEditorProps) => {
  const [proxyUrl, setProxyUrl] = useState<string>(
    props.uiColumn.property?.proxyUrl ?? ""
  )
  const handleUpdate = () => {
    props.onPropertyChange({
      proxyUrl,
    })
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <Input
        type="text"
        placeholder="Proxy url"
        value={proxyUrl}
        onChange={(e) => setProxyUrl(e.target.value)}
      />
      <Button onClick={handleUpdate}>Save</Button>
    </div>
  )
}
