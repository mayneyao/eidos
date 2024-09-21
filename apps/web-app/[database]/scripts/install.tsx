import { useState } from "react"
import { Link, useRevalidator } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
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

  const handleInstallFromLocal = async () => {
    const script = await loadFromLocal()
    await installScript(script)
    setScriptId(script.id)
    revalidator.revalidate()
  }

  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs">
            Install
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <Link to={`/${space}/extensions/store`}>
            <DropdownMenuItem>From Store</DropdownMenuItem>
          </Link>
          <DropdownMenuItem onClick={() => setOpen(true)}>
            From Github
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
    </div>
  )
}
