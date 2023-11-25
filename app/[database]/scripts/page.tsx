/**
 * v0 by Vercel.
 * @see https://v0.dev/t/BAnz6NPEE7T
 */

import { IScript } from "@/worker/meta_table/script"
import { Link, useLoaderData } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

import { InstallScript } from "./install"

export const ScriptPage = () => {
  const scripts = useLoaderData() as IScript[]
  const { space } = useCurrentPathInfo()

  return (
    <div className="h-full w-full p-6">
      <div className="flex w-full justify-between p-4">
        <Button>New Script</Button>
        <InstallScript />
      </div>
      <Separator />
      <div className="grid w-full grid-cols-3 gap-4 p-4">
        {scripts.map((script) => (
          <div
            key={script.id}
            className="overflow-hidden rounded-lg border shadow-md transition-shadow duration-200 hover:shadow-lg"
          >
            <div className="p-4">
              <h2 className="mb-2 text-xl font-semibold">
                {script.name}({script.version})
              </h2>
              <p>{script.description}</p>
              <Link to={`/${space}/scripts/${script.id}`}>
                <Button className="mt-4" variant="outline">
                  View Details
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
