import { useKeyPress } from "ahooks"

import { useGoto } from "@/hooks/use-goto"
import { Button } from "@/components/ui/button"

import { useLastOpened } from "../[database]/hook"
import { CommonSettingLayout } from "../common-setting-layout"
import { useExtensions } from "./hooks/use-extensions"

export function ExtensionPage() {
  const { lastOpenedTable, lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()
  const { extensions, uploadExtension, getAllExtensions, removeExtension } =
    useExtensions()
  const goBack = () => goto(lastOpenedDatabase, lastOpenedTable)
  useKeyPress("esc", (e) => {
    e.preventDefault()
    goBack()
  })

  const handleUploadExtension = async () => {
    const dirHandle: FileSystemDirectoryHandle = await (
      window as any
    ).showDirectoryPicker()
    await uploadExtension(dirHandle)
    await getAllExtensions()
  }
  const handleExtensionClick = async (extensionName: string) => {
    window.open(`//${window.location.host}/ext/${extensionName}`)
  }

  return (
    <CommonSettingLayout
      title="Extensions"
      description="Extensions are a way to extend the functionality of Eidos."
    >
      {extensions.map((extension) => {
        return (
          <div key={extension.name} className="flex items-center gap-2">
            {extension.name}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => removeExtension(extension.name)}
            >
              del
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExtensionClick(extension.name)}
            >
              open
            </Button>
          </div>
        )
      })}
      <Button onClick={handleUploadExtension}>upload extension</Button>
    </CommonSettingLayout>
  )
}
