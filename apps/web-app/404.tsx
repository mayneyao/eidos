// Import useHistory
import { useLastOpened } from "./[database]/hook"

export const NotFound = () => {
  const { setLastOpenedDatabase, lastOpenedDatabase } = useLastOpened()

  const handleGoHome = () => {
    setLastOpenedDatabase("") // Clear last opened database
    setTimeout(() => {
      window.location.href = "/" // Navigate to home
    }, 300)
  }

  return (
    <div className="flex w-full h-full flex-col items-center justify-center">
      <div className="text-4xl text-gray-500">404</div>
      <div className="text-lg text-gray-500">Page Not Found</div>
      <button onClick={handleGoHome} className="text-blue-500">
        Go Home
      </button>
    </div>
  )
}
