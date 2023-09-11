import { useKeyPress } from "ahooks"
import { Minimize2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useGoto } from "@/hooks/use-goto"

import { useLastOpened } from "../[database]/hook"
import { useAllExtensions } from "./hooks"

export function ExtensionPage() {
  const { lastOpenedTable, lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()
  const [currentExt, setCurrentExt] = useState<string | null>(null)
  const { extensions, uploadExtension } = useAllExtensions()
  const goBack = () => goto(lastOpenedDatabase, lastOpenedTable)
  useKeyPress("esc", (e) => {
    e.preventDefault()
    goBack()
  })

  const handleUploadExtension = async () => {
    const dirHandle: FileSystemDirectoryHandle = await (
      window as any
    ).showDirectoryPicker()
    uploadExtension(dirHandle)
  }
  const handleExtensionClick = async (extensionName: string) => {
    setCurrentExt(extensionName)
  }

  return (
    <div className="grid w-full grid-cols-5 ">
      <div className="col-span-1" />
      <div className="col-span-5 space-y-6 p-4 pb-16 md:block md:p-10 xl:col-span-3">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <h2 className="text-2xl font-bold tracking-tight">Extensions</h2>
            <p className="text-muted-foreground">
              Extensions are a way to extend the functionality of Eidos.
            </p>
          </div>
          <Button variant="ghost" onClick={goBack}>
            <Minimize2 className="mr-2 h-4 w-4" /> ESC
          </Button>
        </div>
        <Separator className="my-6" />
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
          <aside className="-mx-4 lg:w-1/5">
            {/* <SidebarNav items={sidebarNavItems} /> */}
          </aside>
          <div className="flex-1 lg:max-w-2xl">
            {extensions.map((extension) => {
              return (
                <div
                  onClick={() => handleExtensionClick(extension.name)}
                  key={extension.name}
                >
                  {extension.name}
                </div>
              )
            })}
            <Button onClick={handleUploadExtension}>upload extension</Button>
            {currentExt && (
              <iframe
                src={`https://${currentExt}.ext.eidos.space`}
                frameBorder="0"
                width={1000}
                height={1000}
              ></iframe>
            )}
          </div>
        </div>
      </div>
      <div className="col-span-1" />
    </div>
  )
}
