import { useMemo, useState } from "react"
import { IScript } from "@/worker/web-worker/meta_table/script"
import { GithubIcon, HomeIcon } from "lucide-react"
import { Link, useLoaderData, useRevalidator } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

import { useGithubScriptContent } from "./hooks/use-github-script"
import { useGithubStore } from "./hooks/use-github-store"
import { useScript } from "./hooks/use-script"

export const ScriptStorePage = () => {
  const { scripts } = useGithubStore()
  const installedScripts = useLoaderData() as IScript[]
  const { fetchContent } = useGithubScriptContent()
  const { installScript, updateScript } = useScript()

  const installedScriptMap = useMemo(() => {
    return new Map(installedScripts.map((script) => [script.id, script]))
  }, [installedScripts])

  const [installingRepo, setInstallingRepo] = useState("")
  const { space } = useCurrentPathInfo()
  const revalidator = useRevalidator()

  const handleInstall = async (repo: string) => {
    const script = await fetchContent(`https://github.com/${repo}`)
    setInstallingRepo(repo)
    script && (await installScript(script))
    setInstallingRepo("")
    revalidator.revalidate()
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
      <div className="flex w-full justify-between py-4">
        <Link to={`/${space}/scripts`}>
          <HomeIcon></HomeIcon>
        </Link>
      </div>
      <Separator />
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scripts?.map((script) => {
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
                <div>
                  <div className="flex justify-between">
                    <h2 className="mb-2 text-xl font-semibold">
                      {script.name}({script.version})
                    </h2>
                  </div>
                  <p>{script.description}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Link
                      to={`https://github.com/${script.repo}`}
                      target="_blank"
                    >
                      <GithubIcon></GithubIcon>
                    </Link>
                  </div>
                  {hasUpdate ? (
                    <Button
                      className="bg-blue-500 hover:bg-blue-600"
                      disabled={isInstalling}
                      onClick={() => handleUpdate(script.repo)}
                    >
                      {isInstalling ? "Updating..." : "Update"}
                    </Button>
                  ) : (
                    <Button
                      disabled={hasInstalled || isInstalling}
                      onClick={() => handleInstall(script.repo)}
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
          )
        })}
      </div>
    </div>
  )
}
