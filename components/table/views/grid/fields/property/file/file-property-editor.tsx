import { useState } from "react"

import { FileProperty } from "@/lib/fields/file"
import { IField } from "@/lib/store/interface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface IFieldPropertyEditorProps {
  uiColumn: IField<FileProperty>
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Proxy</Label>
        <Input
          type="text"
          placeholder="Proxy url"
          className="w-[300px]"
          value={proxyUrl}
          onChange={(e) => setProxyUrl(e.target.value)}
        />
      </div>

      <Button onClick={handleUpdate}>Save</Button>
    </div>
  )
}
