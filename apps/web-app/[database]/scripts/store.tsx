import { useMemo, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { GithubIcon, HomeIcon } from "lucide-react"
import { Link, useLoaderData, useRevalidator } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useExtensions } from "@/apps/web-app/extensions/hooks/use-extensions"

import {
  downloadLatestRelease,
  useGithubScriptContent,
} from "./hooks/use-github-script"
import { IStoreExtItem, useGithubStore } from "./hooks/use-github-store"
import { useScript } from "./hooks/use-script"

export const ScriptStorePage = () => {
  const { exts } = useGithubStore()
  const installedScripts = useLoaderData() as IScript[]
  const { fetchContent } = useGithubScriptContent()
  const { installScript, updateScript } = useScript()
  const { loadExtensionFromZipFile } = useExtensions()
  const installedScriptMap = useMemo(() => {
    return new Map(installedScripts.map((script) => [script.id, script]))
  }, [installedScripts])

  const [installingRepo, setInstallingRepo] = useState("")
  const { space } = useCurrentPathInfo()
  const revalidator = useRevalidator()

  const handleInstall = async (ext: IStoreExtItem) => {
    switch (ext.type) {
      case "script":
        const script = await fetchContent(`https://github.com/${ext.repo}`)
        setInstallingRepo(ext.repo)
        script && (await installScript(script))
        setInstallingRepo("")
        revalidator.revalidate()
        break
      case "app":
        // not working yet
        const file = await downloadLatestRelease(ext.repo)
        setInstallingRepo(ext.repo)
        if (file) {
          await loadExtensionFromZipFile(file)
        }
        setInstallingRepo("")
        revalidator.revalidate()
        break
      default:
        break
    }
  }

  const handleUpdate = async (repo: string) => {
    const script = await fetchContent(`https://github.com/${repo}`)
    setInstallingRepo(repo)
    script && (await updateScript(script))
    setInstallingRepo("")
    revalidator.revalidate()
  }

  return (
    <div className="h-full w-full p-6">
      <div className="flex w-full justify-between py-1">
        <Link to={`/${space}/extensions`}>
          <HomeIcon></HomeIcon>
        </Link>
      </div>
      <Separator />
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {exts?.map((script) => {
          const hasInstalled = installedScriptMap.has(script.id)
          const installedScript = installedScriptMap.get(script.id)
          const isInstalling = installingRepo === script.repo
          const hasUpdate =
            installedScript && installedScript.version < script.version
          return (
            <div
              key={script.repo}
              className="min-h-[200px] overflow-hidden rounded-lg border shadow-md transition-shadow duration-200 hover:shadow-lg"
            >
              <div className="flex h-full flex-col justify-between p-4">
                <div className="flex flex-col justify-between gap-1">
                  <h2 className="flex items-center justify-between text-xl font-semibold">
                    <span>
                      {script.name}({script.version})
                    </span>
                    <Link
                      to={`https://github.com/${script.repo}`}
                      target="_blank"
                    >
                      <GithubIcon className=" h-5 w-5 opacity-80"></GithubIcon>
                    </Link>
                  </h2>
                  <h3 className="flex items-center gap-1">
                    By <span>{script.author}</span>{" "}
                  </h3>
                  <p className=" opacity-80">{script.description}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2"></div>
                  <div
                    className={cn("flex", {
                      "opacity-0 pointer-events-none": ["app"].includes(
                        script.type
                      ),
                    })}
                  >
                    {hasUpdate ? (
                      <Button
                        className="bg-blue-500 hover:bg-blue-600"
                        disabled={isInstalling}
                        size="xs"
                        onClick={() => handleUpdate(script.repo)}
                      >
                        {isInstalling ? "Updating..." : "Update"}
                      </Button>
                    ) : (
                      <Button
                        disabled={hasInstalled || isInstalling}
                        onClick={() => handleInstall(script)}
                        size="xs"
                      >
                        {hasInstalled
                          ? `Installed ${installedScript?.version}`
                          : isInstalling
                          ? "Installing..."
                          : "Install"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
