import { useEffect } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { SpaceSelect } from "@/components/space-select"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSpace } from "@/apps/web-app/hooks/use-space"

import { useLastOpened } from "./[database]/hook"

export const LandingPage = () => {
  const { spaceList } = useSpace()
  const { lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()
  const { navigate } = useRouterAdapter()

  useEffect(() => {
    if (lastOpenedDatabase) {
      goto(lastOpenedDatabase)
    }
  }, [lastOpenedDatabase, goto, navigate])

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="w-[200px]">
        <SpaceSelect spaces={spaceList} />
      </div>
    </div>
  )
}
