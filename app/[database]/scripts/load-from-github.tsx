import { useState } from "react"
import { useRevalidator } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

import { useGithubScriptContent, useScript } from "./hooks"

export const LoadFromGithubDialog = () => {
  const { fetchContent, script, loading } = useGithubScriptContent()
  const [installLoading, setInstallLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState("")
  const { addScript } = useScript()
  const handleLoad = async (link: string) => {
    await fetchContent(link)
  }
  const revalidator = useRevalidator()
  const handleInstall = async () => {
    setInstallLoading(true)
    script && (await addScript(script))
    setInstallLoading(false)
    setOpen(false)
    revalidator.revalidate()
  }
  return (
    <div className="flex gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Load From Github</Button>
        </DialogTrigger>
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
      <Button variant="outline">Script Market</Button>
    </div>
  )
}
