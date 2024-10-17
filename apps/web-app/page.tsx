import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { isDesktopMode } from "@/lib/env"
import { useActivation } from "@/hooks/use-activation"
import { useGoto } from "@/hooks/use-goto"
import { useSpace } from "@/hooks/use-space"
import { DatabaseSelect } from "@/components/database-select"
import { Landing } from "@/components/landing"

import { useLastOpened } from "./[database]/hook"

export const LandingPage = () => {
  const { spaceList } = useSpace()
  let [searchParams, setSearchParams] = useSearchParams()
  const isHome = Boolean(searchParams.get("home"))
  const { lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()
  const navigate = useNavigate()
  const { isActivated } = useActivation()

  useEffect(() => {
    if (isDesktopMode && !isActivated) {
      navigate("/my-licenses")
    } else if (isActivated && lastOpenedDatabase && !isHome) {
      goto(lastOpenedDatabase)
    }
  }, [lastOpenedDatabase, goto, isActivated, isHome])

  // activated and it's the first time to open the app
  if (isActivated && !lastOpenedDatabase && !isHome) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="w-[200px]">
          <DatabaseSelect databases={spaceList} />
        </div>
      </div>
    )
  }

  return <Landing />
}
