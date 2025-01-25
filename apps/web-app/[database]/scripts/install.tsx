import { useState } from "react"
import { useRequest } from "ahooks"
import { Link, useNavigate, useRevalidator } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

import { getScriptFromV0 } from "./helper"
import { useGithubScriptContent } from "./hooks/use-github-script"
import { useDirHandleStore, useLocalScript } from "./hooks/use-local-script"
import { useScript } from "./hooks/use-script"

export const InstallScript = () => {
  const { fetchContent, script, loading } = useGithubScriptContent()

  const [open, setOpen] = useState(false)
  const [link, setLink] = useState("")
  const { installScript, installLoading, updateScript } = useScript()
  const handleLoad = async (link: string) => {
    await fetchContent(link)
  }
  const revalidator = useRevalidator()
  const handleInstall = async () => {
    script && (await installScript(script))
    setOpen(false)
    revalidator.revalidate()
  }
  const { loadFromLocal } = useLocalScript()
  const { setScriptId } = useDirHandleStore()
  const { space } = useCurrentPathInfo()
  const [v0Open, setV0Open] = useState(false)
  const [v0Link, setV0Link] = useState("")
  const navigator = useNavigate()

  const handleInstallFromLocal = async () => {
    const script = await loadFromLocal()
    await installScript(script)
    setScriptId(script.id)
    revalidator.revalidate()
  }

  const handleInstallFromV0 = async () => {
    const script = await getScriptFromV0(v0Link)
    await installScript(script)
    setScriptId(script.id)
    revalidator.revalidate()
    // close the dialog
    setV0Open(false)
    // jump to the script page
    navigator(`/${space}/extensions/${script.id}`)
  }

  const { loading: v0Loading, run: runInstallFromV0 } = useRequest(
    handleInstallFromV0,
    {
      manual: true,
    }
  )

  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs">
            Install
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {/* <Link to={`/${space}/extensions/store`}>
            <DropdownMenuItem>From Store</DropdownMenuItem>
          </Link> */}
          <DropdownMenuItem onClick={() => setOpen(true)}>
            From Github
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setV0Open(true)}>
            From V0
          </DropdownMenuItem>
          {/* <DropdownMenuItem onClick={handleInstallFromLocal}>
            From Local
          </DropdownMenuItem> */}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Script Repo link</DialogTitle>
            <DialogDescription>
              Please enter the link of the script repo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="link" className="sr-only">
                Link
              </Label>
              <Input
                id="link"
                placeholder="https://github.com"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="px-3"
              onClick={() => handleLoad(link)}
            >
              Load
            </Button>
          </div>
          {loading && <p>Loading...</p>}
          {script && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <h2 className="mb-2 text-xl font-semibold">{script.name}</h2>
                <p>{script.description}</p>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={handleInstall}
                  disabled={installLoading}
                >
                  {installLoading ? "Installing..." : "Install"}
                </Button>
              </div>
            </>
          )}
          <DialogFooter className="sm:justify-start"></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={v0Open} onOpenChange={setV0Open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>V0 Block Link</DialogTitle>
            <DialogDescription>
              Please enter the link of the V0 block.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="v0-link" className="sr-only">
                Link
              </Label>
              <Input
                id="v0-link"
                placeholder="https://v0.dev/chat/b/..."
                value={v0Link}
                onChange={(e) => setV0Link(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="px-3"
              onClick={runInstallFromV0}
              disabled={v0Loading}
            >
              {v0Loading ? "Installing..." : "Install"}
            </Button>
          </div>
          <DialogFooter className="sm:justify-start"></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
