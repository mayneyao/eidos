import { useEffect } from "react"
import { Link } from "react-router-dom"

import { useLastOpened } from "./[database]/hook"

export const NotFound = () => {
  const { setLastOpenedDatabase } = useLastOpened()
  useEffect(() => {
    // remove last opened database
    setLastOpenedDatabase("")
  }, [setLastOpenedDatabase])
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="text-4xl text-gray-500">404</div>
      <div className="text-lg text-gray-500">Page Not Found</div>
      <Link to="/" className="text-blue-500">
        Go Home
      </Link>
    </div>
  )
}
