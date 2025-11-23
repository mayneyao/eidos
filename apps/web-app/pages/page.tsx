import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

import { SpaceSelect } from "@/components/space-select"
import { useActivation } from "@/apps/web-app/hooks/use-activation"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSpace } from "@/apps/web-app/hooks/use-space"

import { useLastOpened } from "./[database]/hook"

export const LandingPage = () => {
  const { spaceList } = useSpace()
  const { lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()
  const navigate = useNavigate()
  const { isActivated } = useActivation()

  useEffect(() => {
    if (!isActivated) {
      navigate("/my-licenses")
    } else if (lastOpenedDatabase) {
      goto(lastOpenedDatabase)
    }
  }, [lastOpenedDatabase, goto, isActivated, navigate])

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="w-[200px]">
        <SpaceSelect spaces={spaceList} />
      </div>
    </div>
  )
}
